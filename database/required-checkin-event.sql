CREATE OR REPLACE FUNCTION public.ehe_record_volunteer_visit(p_request uuid, p_kind text, p_name text, p_email text, p_event text DEFAULT NULL::text, p_shift text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
 nm text:=btrim(normalize(coalesce(p_name,''),NFKC));
 em text:=lower(btrim(coalesce(p_email,'')));
 nk text; evt text:=nullif(p_event,''); sh text:=nullif(p_shift,''); rl text:=nullif(p_role,'');
 ts timestamptz:=clock_timestamp(); day date;
 p public.ehe_people; b public.ehe_bookings; s public.ehe_shifts; l public.ehe_service;
 prior public.ehe_volunteer_visit_requests; payload jsonb; result jsonb; matches integer;
 link_state text:='unlinked'; origin text:='walk_in'; out_status text; duty_list text[]; obs_list text[];
BEGIN
 day:=(ts AT TIME ZONE 'America/New_York')::date;
 nk:=lower(regexp_replace(nm,'[[:space:]]+',' ','g'));
 IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN ('in','out') OR length(nm) NOT BETWEEN 1 AND 120 OR length(em)>254 OR em!~'^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR length(p_data::text)>12000 OR length(coalesce(evt,''))>100 OR length(coalesce(sh,''))>100 OR (rl IS NOT NULL AND rl NOT IN ('registration','survey','participant_support','teaching','logistics','photo_video','staff','other','other_text')) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF (p_data ? 'needs_support' AND jsonb_typeof(p_data->'needs_support')<>'boolean') OR jsonb_typeof(coalesce(p_data->'duties','[]'))<>'array' OR jsonb_typeof(coalesce(p_data->'observations','[]'))<>'array' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 SELECT coalesce(array_agg(DISTINCT value),'{}') INTO duty_list FROM jsonb_array_elements_text(coalesce(p_data->'duties','[]'));
 SELECT coalesce(array_agg(DISTINCT value),'{}') INTO obs_list FROM jsonb_array_elements_text(coalesce(p_data->'observations','[]'));
 IF NOT duty_list<@ARRAY['registration','survey','participant_support','teaching','logistics','photo_video','staff','other','other_text']::text[] OR NOT obs_list<@ARRAY['questions','answer','practice','support','listen','declined','nochance','unknown','other_text']::text[] OR length(coalesce(p_data->>'support_details',''))>1500 OR length(coalesce(p_data->>'duty_other',''))>300 OR length(coalesce(p_data->>'observation_other',''))>600 OR length(coalesce(p_data->>'specific_observations',''))>2000 OR length(coalesce(p_data->>'went_well',''))>2000 OR length(coalesce(p_data->>'improvements',''))>2000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 payload:=jsonb_build_object('name',nm,'email',em,'event_id',evt,'shift_id',sh,'role',rl,'data',p_data);
 -- Share the existing volunteer writer lock: old and new clients cannot race.
 PERFORM pg_advisory_xact_lock(612614060);
 SELECT * INTO prior FROM public.ehe_volunteer_visit_requests WHERE request_id=p_request;
 IF FOUND THEN
  IF prior.kind<>p_kind OR prior.payload<>payload THEN RAISE EXCEPTION 'REQUEST_REUSED'; END IF;
  RETURN prior.outcome;
 END IF;
 IF p_kind='in' AND evt IS NULL AND sh IS NULL THEN RAISE EXCEPTION 'EVENT_REQUIRED'; END IF;
 -- Locate the caller's current self-reported visit. Do not expose a profile or a roster.
 SELECT count(*) INTO matches FROM public.ehe_service v LEFT JOIN public.ehe_bookings bk ON bk.id=v.booking_id LEFT JOIN public.ehe_people vp ON vp.id=bk.person_id
 WHERE v.deleted_at IS NULL AND v.checked_out_at IS NULL AND v.checked_in_at>=ts-interval '36 hours'
 AND coalesce(v.visit_email,vp.email)=em
 AND (coalesce(v.visit_name_key,lower(regexp_replace(normalize(btrim(vp.name),NFKC),'[[:space:]]+',' ','g')))=nk OR (v.visit_name_key IS NULL AND lower(regexp_replace(normalize(btrim(vp.alias),NFKC),'[[:space:]]+',' ','g'))=nk));
 IF matches>1 THEN RAISE EXCEPTION 'AMBIGUOUS_OPEN_VISIT'; END IF;
 IF matches=1 THEN
  SELECT v.* INTO l FROM public.ehe_service v LEFT JOIN public.ehe_bookings bk ON bk.id=v.booking_id LEFT JOIN public.ehe_people vp ON vp.id=bk.person_id
  WHERE v.deleted_at IS NULL AND v.checked_out_at IS NULL AND v.checked_in_at>=ts-interval '36 hours' AND coalesce(v.visit_email,vp.email)=em
  AND (coalesce(v.visit_name_key,lower(regexp_replace(normalize(btrim(vp.name),NFKC),'[[:space:]]+',' ','g')))=nk OR (v.visit_name_key IS NULL AND lower(regexp_replace(normalize(btrim(vp.alias),NFKC),'[[:space:]]+',' ','g'))=nk)) FOR UPDATE OF v;
  IF p_kind='in' THEN out_status:='already_checked_in';
  ELSE
   IF evt IS NOT NULL AND coalesce(l.visit_event_id,(SELECT es.event_id FROM public.ehe_bookings eb JOIN public.ehe_shifts es ON es.id=eb.shift_id WHERE eb.id=l.booking_id)) IS NOT NULL AND evt IS DISTINCT FROM coalesce(l.visit_event_id,(SELECT es.event_id FROM public.ehe_bookings eb JOIN public.ehe_shifts es ON es.id=eb.shift_id WHERE eb.id=l.booking_id)) THEN RAISE EXCEPTION 'VISIT_CONTEXT_MISMATCH'; END IF;
   IF sh IS NOT NULL AND sh IS DISTINCT FROM coalesce(l.visit_shift_id,(SELECT shift_id FROM public.ehe_bookings WHERE id=l.booking_id)) THEN RAISE EXCEPTION 'VISIT_CONTEXT_MISMATCH'; END IF;
   UPDATE public.ehe_service SET checked_out_at=ts,duties=duty_list,observations=obs_list,duty_other=coalesce(p_data->>'duty_other',''),observation_other=coalesce(p_data->>'observation_other',''),specific_observations=coalesce(p_data->>'specific_observations',''),went_well=coalesce(p_data->>'went_well',''),improvements=coalesce(p_data->>'improvements',''),version=version+1 WHERE id=l.id RETURNING * INTO l;
   out_status:='checked_out';
  END IF;
 ELSE
  -- Repeated checkout (including a retry with a different request ID) never changes time or feedback.
  IF p_kind='out' THEN
   SELECT v.* INTO l FROM public.ehe_service v LEFT JOIN public.ehe_bookings bk ON bk.id=v.booking_id LEFT JOIN public.ehe_people vp ON vp.id=bk.person_id LEFT JOIN public.ehe_shifts vs ON vs.id=bk.shift_id
   WHERE v.deleted_at IS NULL AND v.checked_out_at IS NOT NULL AND v.checked_out_at>=ts-interval '24 hours' AND coalesce(v.visit_email,vp.email)=em
   AND (coalesce(v.visit_name_key,lower(regexp_replace(normalize(btrim(vp.name),NFKC),'[[:space:]]+',' ','g')))=nk OR (v.visit_name_key IS NULL AND lower(regexp_replace(normalize(btrim(vp.alias),NFKC),'[[:space:]]+',' ','g'))=nk))
   AND (evt IS NULL OR coalesce(v.visit_event_id,vs.event_id)=evt) AND (sh IS NULL OR coalesce(v.visit_shift_id,bk.shift_id)=sh)
   ORDER BY v.checked_out_at DESC LIMIT 1;
   IF NOT FOUND THEN RAISE EXCEPTION 'NO_OPEN_CHECKIN'; END IF;
   out_status:='already_checked_out';
  ELSE
   IF sh IS NOT NULL THEN
    SELECT * INTO s FROM public.ehe_shifts WHERE id=sh AND published AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'SHIFT_UNAVAILABLE'; END IF;
    IF evt IS NOT NULL AND evt<>s.event_id THEN RAISE EXCEPTION 'VISIT_CONTEXT_MISMATCH'; END IF;
    evt:=s.event_id;
   END IF;
   IF evt IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ehe_events WHERE id=evt AND published AND event_date=day) THEN RAISE EXCEPTION 'EVENT_NOT_TODAY'; END IF;
   SELECT count(*) INTO matches FROM public.ehe_people WHERE kind='volunteer' AND email=em;
   IF matches=1 THEN
    SELECT * INTO p FROM public.ehe_people WHERE kind='volunteer' AND email=em;
    IF p.archived_at IS NOT NULL THEN p:=NULL;
    ELSE link_state:=CASE WHEN lower(regexp_replace(normalize(btrim(p.name),NFKC),'[[:space:]]+',' ','g'))=nk OR lower(regexp_replace(normalize(btrim(p.alias),NFKC),'[[:space:]]+',' ','g'))=nk THEN 'matched' ELSE 'email_match' END; END IF;
   ELSIF matches>1 THEN
    SELECT count(*) INTO matches FROM public.ehe_people WHERE kind='volunteer' AND email=em AND archived_at IS NULL AND (lower(regexp_replace(normalize(btrim(name),NFKC),'[[:space:]]+',' ','g'))=nk OR lower(regexp_replace(normalize(btrim(alias),NFKC),'[[:space:]]+',' ','g'))=nk);
    IF matches=1 THEN SELECT * INTO p FROM public.ehe_people WHERE kind='volunteer' AND email=em AND archived_at IS NULL AND (lower(regexp_replace(normalize(btrim(name),NFKC),'[[:space:]]+',' ','g'))=nk OR lower(regexp_replace(normalize(btrim(alias),NFKC),'[[:space:]]+',' ','g'))=nk);link_state:='matched'; END IF;
   ELSE
    INSERT INTO public.ehe_people(kind,name,email,joined_on,profile_status,source_ref) VALUES('volunteer',nm,em,day,'basic','website_walk_in') RETURNING * INTO p;
    link_state:='new';
   END IF;
   -- Attach a confirmed booking only when uniquely identifiable. Never create a booking or consume capacity for a walk-in.
   IF p.id IS NOT NULL THEN
    SELECT count(*) INTO matches FROM public.ehe_bookings bk JOIN public.ehe_shifts bs ON bs.id=bk.shift_id JOIN public.ehe_events be ON be.id=bs.event_id
    WHERE bs.deleted_at IS NULL AND bk.person_id=p.id AND bk.status='confirmed' AND be.event_date=day AND (evt IS NULL OR be.id=evt) AND (sh IS NULL OR bs.id=sh) AND (rl IS NULL OR bs.duty=rl);
    IF matches=1 THEN
     SELECT bk.* INTO b FROM public.ehe_bookings bk JOIN public.ehe_shifts bs ON bs.id=bk.shift_id JOIN public.ehe_events be ON be.id=bs.event_id
     WHERE bs.deleted_at IS NULL AND bk.person_id=p.id AND bk.status='confirmed' AND be.event_date=day AND (evt IS NULL OR be.id=evt) AND (sh IS NULL OR bs.id=sh) AND (rl IS NULL OR bs.duty=rl);
     SELECT * INTO s FROM public.ehe_shifts WHERE id=b.shift_id;evt:=s.event_id;sh:=s.id;origin:='pre_registered';
    END IF;
   END IF;
   -- Completed same-day visits are not silently restarted by a repeated tap.
   SELECT v.* INTO l FROM public.ehe_service v LEFT JOIN public.ehe_bookings bk ON bk.id=v.booking_id LEFT JOIN public.ehe_people vp ON vp.id=bk.person_id LEFT JOIN public.ehe_shifts vs ON vs.id=bk.shift_id
   WHERE v.deleted_at IS NULL AND coalesce(v.visit_email,vp.email)=em AND (coalesce(v.visit_name_key,lower(regexp_replace(normalize(btrim(vp.name),NFKC),'[[:space:]]+',' ','g')))=nk)
   AND (v.checked_in_at AT TIME ZONE 'America/New_York')::date=day
   AND ((b.id IS NOT NULL AND v.booking_id=b.id) OR (coalesce(v.visit_event_id,vs.event_id) IS NOT DISTINCT FROM evt AND coalesce(v.visit_shift_id,bk.shift_id) IS NOT DISTINCT FROM sh))
   ORDER BY v.checked_in_at DESC LIMIT 1;
   IF FOUND THEN out_status:=CASE WHEN l.checked_out_at IS NULL THEN 'already_checked_in' ELSE 'already_checked_out' END;
   ELSE
    INSERT INTO public.ehe_service(booking_id,checked_in_at,needs_support,support_details,visit_person_id,visit_event_id,visit_shift_id,visit_name,visit_email,visit_name_key,visit_date,visit_role,visit_identity,visit_origin)
    VALUES(b.id,ts,coalesce((p_data->>'needs_support')::boolean,false),coalesce(p_data->>'support_details',''),p.id,evt,sh,nm,em,nk,day,rl,link_state,origin) RETURNING * INTO l;
    out_status:='checked_in';
   END IF;
  END IF;
 END IF;
 result:=jsonb_build_object('status',out_status,'recorded',true,'request_id',p_request,'service_id',l.id,'checked_in_at',l.checked_in_at,'checked_out_at',l.checked_out_at,'duration_seconds',CASE WHEN l.checked_out_at IS NULL THEN NULL ELSE floor(extract(epoch FROM l.checked_out_at-l.checked_in_at)) END,'requires_review',false,'server_time',ts);
 INSERT INTO public.ehe_volunteer_visit_requests(request_id,kind,payload,outcome,service_id) VALUES(p_request,p_kind,payload,result,l.id);
 INSERT INTO public.ehe_audit(action,target,details) VALUES('volunteer_visit_'||p_kind,l.id::text,jsonb_build_object('request_id',p_request,'status',out_status,'entry_method',coalesce(l.visit_origin,'pre_registered'),'event_id',coalesce(l.visit_event_id,evt)));
 RETURN result;
END $function$

