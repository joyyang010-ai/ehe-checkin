ALTER TABLE public.ehe_service ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_booking_id uuid REFERENCES public.ehe_bookings(id);
ALTER TABLE public.ehe_shifts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.ehe_service DROP CONSTRAINT ehe_service_visit_role_check;
ALTER TABLE public.ehe_service ADD CONSTRAINT ehe_service_visit_role_check CHECK(visit_role IN ('registration','survey','participant_support','teaching','logistics','photo_video','staff','other','other_text'));
ALTER TABLE public.ehe_service DROP CONSTRAINT ehe_duties_allowed;
ALTER TABLE public.ehe_service ADD CONSTRAINT ehe_duties_allowed CHECK(duties <@ ARRAY['registration','survey','participant_support','teaching','logistics','photo_video','staff','other','other_text']::text[]);
ALTER TABLE public.ehe_shifts DROP CONSTRAINT ehe_shifts_duty_check;
ALTER TABLE public.ehe_shifts ADD CONSTRAINT ehe_shifts_duty_check CHECK(duty IN ('registration','survey','participant_support','teaching','logistics','photo_video','staff','other'));

CREATE OR REPLACE FUNCTION public.ehe_manage_deleted_record(p_actor uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $fn$
DECLARE l public.ehe_service; s public.ehe_shifts; b public.ehe_bookings; p public.ehe_people; restoring boolean:=p_data->>'operation'='restore';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.ehe_staff st JOIN auth.users u ON lower(u.email)=st.email WHERE u.id=p_actor AND st.active AND st.access_role='admin' AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 PERFORM pg_advisory_xact_lock(612614060);
 IF length(btrim(coalesce(p_data->>'reason','')))<2 OR length(p_data->>'reason')>1000 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 IF p_data->>'operation' NOT IN ('delete','restore') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF p_data->>'target_type'='service' THEN
  SELECT * INTO l FROM public.ehe_service WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF l.version IS DISTINCT FROM (p_data->>'version')::integer OR restoring IS DISTINCT FROM (l.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'CONFLICT_REFRESH'; END IF;
  IF restoring THEN
   IF l.checked_out_at IS NULL AND EXISTS(SELECT 1 FROM public.ehe_service WHERE deleted_at IS NULL AND checked_out_at IS NULL AND visit_email=l.visit_email AND visit_name_key=l.visit_name_key AND visit_date=l.visit_date) THEN RAISE EXCEPTION 'CONFLICT_REFRESH'; END IF;
   IF l.deleted_booking_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.ehe_service WHERE booking_id=l.deleted_booking_id) THEN RAISE EXCEPTION 'CONFLICT_REFRESH'; END IF;
   UPDATE public.ehe_service SET deleted_at=NULL,booking_id=l.deleted_booking_id,deleted_booking_id=NULL,version=version+1 WHERE id=l.id;
  ELSE
   SELECT * INTO b FROM public.ehe_bookings WHERE id=l.booking_id;
   SELECT * INTO p FROM public.ehe_people WHERE id=b.person_id;
   SELECT * INTO s FROM public.ehe_shifts WHERE id=b.shift_id;
   UPDATE public.ehe_service SET deleted_at=clock_timestamp(),deleted_booking_id=booking_id,booking_id=NULL,
    visit_name=coalesce(visit_name,p.name),visit_email=coalesce(visit_email,p.email),visit_name_key=coalesce(visit_name_key,lower(regexp_replace(normalize(btrim(p.name),NFKC),'[[:space:]]+',' ','g'))),visit_date=coalesce(visit_date,(checked_in_at AT TIME ZONE 'America/New_York')::date),visit_event_id=coalesce(visit_event_id,s.event_id),visit_role=coalesce(visit_role,s.duty),version=version+1 WHERE id=l.id;
  END IF;
  INSERT INTO public.ehe_audit(actor_id,action,target,details) VALUES(p_actor,'volunteer_visit_'||CASE WHEN restoring THEN 'restored' ELSE 'deleted' END,l.id::text,jsonb_build_object('previous',to_jsonb(l),'reason',p_data->>'reason'));
 ELSIF p_data->>'target_type'='shift' THEN
  SELECT * INTO s FROM public.ehe_shifts WHERE id=p_data->>'id' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF s.updated_at IS DISTINCT FROM (p_data->>'version')::timestamptz OR restoring IS DISTINCT FROM (s.deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'CONFLICT_REFRESH'; END IF;
  UPDATE public.ehe_shifts SET deleted_at=CASE WHEN restoring THEN NULL ELSE clock_timestamp() END,published=false,updated_at=clock_timestamp() WHERE id=s.id;
  INSERT INTO public.ehe_audit(actor_id,action,target,details) VALUES(p_actor,'shift_'||CASE WHEN restoring THEN 'restored' ELSE 'deleted' END,s.id,jsonb_build_object('previous',to_jsonb(s),'reason',p_data->>'reason'));
 ELSE RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 RETURN jsonb_build_object('ok',true);
END $fn$;
REVOKE ALL ON FUNCTION public.ehe_manage_deleted_record(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ehe_manage_deleted_record(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.ehe_correct_volunteer_visit(p_actor uuid, p_email text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE l public.ehe_service; prior public.ehe_volunteer_visit_requests; req uuid; tsin timestamptz; tsout timestamptz; evt text; rl text; result jsonb; old_event text; nm text; em text; pid text; bid uuid; duties_value text[]; observations_value text[]; details_edit boolean:=coalesce((p_data->>'edit_details')::boolean,false);
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.ehe_staff st JOIN auth.users u ON lower(u.email)=st.email WHERE u.id=p_actor AND st.email=p_email AND st.active AND st.access_role IN ('admin','staff') AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR length(btrim(coalesce(p_data->>'reason','')))<2 OR length(coalesce(p_data->>'reason',''))>1000 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 req:=(p_data->>'request_id')::uuid;IF req IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 PERFORM pg_advisory_xact_lock(612614060);
 SELECT * INTO prior FROM public.ehe_volunteer_visit_requests WHERE request_id=req;
 IF FOUND THEN IF prior.kind<>'correct' OR prior.payload<>p_data||jsonb_build_object('actor',p_actor) THEN RAISE EXCEPTION 'REQUEST_REUSED';END IF;RETURN prior.outcome;END IF;
 IF p_data->>'operation' IN ('delete','restore') THEN
  IF NOT EXISTS(SELECT 1 FROM public.ehe_staff WHERE email=p_email AND active AND access_role='admin') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  result:=public.ehe_manage_deleted_record(p_actor,p_data);
  INSERT INTO public.ehe_volunteer_visit_requests(request_id,kind,payload,outcome,service_id) VALUES(req,'correct',p_data||jsonb_build_object('actor',p_actor),result,CASE WHEN p_data->>'target_type'='service' THEN (p_data->>'id')::uuid ELSE NULL END);
  RETURN result;
 END IF;
 IF details_edit THEN
  nm:=btrim(normalize(coalesce(p_data->>'name',''),NFKC));em:=lower(btrim(coalesce(p_data->>'email','')));
  IF length(nm) NOT BETWEEN 1 AND 120 OR length(em)>254 OR em !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' OR jsonb_typeof(p_data->'duties') IS DISTINCT FROM 'array' OR jsonb_typeof(p_data->'observations') IS DISTINCT FROM 'array' OR jsonb_typeof(p_data->'needs_support') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  SELECT coalesce(array_agg(DISTINCT value),'{}') INTO duties_value FROM jsonb_array_elements_text(p_data->'duties');
  SELECT coalesce(array_agg(DISTINCT value),'{}') INTO observations_value FROM jsonb_array_elements_text(p_data->'observations');
  IF NOT duties_value<@ARRAY['registration','survey','participant_support','teaching','logistics','photo_video','staff','other','other_text']::text[] OR NOT observations_value<@ARRAY['questions','answer','practice','support','listen','declined','nochance','unknown','other_text']::text[] OR length(coalesce(p_data->>'support_details',''))>1500 OR length(coalesce(p_data->>'duty_other',''))>300 OR length(coalesce(p_data->>'observation_other',''))>600 OR length(coalesce(p_data->>'specific_observations',''))>2000 OR length(coalesce(p_data->>'went_well',''))>2000 OR length(coalesce(p_data->>'improvements',''))>2000 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 END IF;
 IF coalesce((p_data->>'manual_new')::boolean,false) OR coalesce((p_data->>'manual_booking')::boolean,false) THEN
  nm:=btrim(normalize(coalesce(p_data->>'name',''),NFKC));em:=lower(btrim(coalesce(p_data->>'email','')));pid:=nullif(p_data->>'person_id','');
  IF length(nm)<1 OR length(nm)>120 OR length(em)>254 OR em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  IF NOT details_edit AND pid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ehe_people WHERE id=pid AND kind='volunteer' AND lower(btrim(email))=em AND btrim(normalize(name,NFKC))=nm) THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  IF coalesce((p_data->>'manual_booking')::boolean,false) THEN
   bid:=(p_data->>'booking_id')::uuid;
   SELECT b.person_id INTO pid FROM public.ehe_bookings b WHERE b.id=bid AND b.status='confirmed' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
   IF EXISTS(SELECT 1 FROM public.ehe_service WHERE booking_id=bid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'CONFLICT_REFRESH';END IF;
  END IF;
  tsin:=(p_data->>'in_local')::timestamp AT TIME ZONE 'America/New_York';tsout:=nullif(p_data->>'out_local','')::timestamp AT TIME ZONE 'America/New_York';
  IF tsin IS NULL OR tsin>now() OR tsout>now() OR tsout<tsin THEN RAISE EXCEPTION 'INVALID_TIME';END IF;
  evt:=nullif(p_data->>'event_id','');rl:=nullif(p_data->>'role','');
  IF evt IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ehe_events WHERE id=evt AND event_date=(tsin AT TIME ZONE 'America/New_York')::date) THEN RAISE EXCEPTION 'EVENT_DATE_MISMATCH';END IF;
  IF rl IS NOT NULL AND rl NOT IN ('registration','survey','participant_support','teaching','logistics','photo_video','staff','other','other_text') THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  -- A missing visit must not duplicate an existing visit, including a booked one.
  IF EXISTS(SELECT 1 FROM public.ehe_service x LEFT JOIN public.ehe_bookings b ON b.id=x.booking_id LEFT JOIN public.ehe_people p ON p.id=b.person_id
   WHERE x.deleted_at IS NULL AND lower(btrim(coalesce(x.visit_email,p.email)))=em
   AND lower(btrim(normalize(coalesce(x.visit_name,p.name),NFKC)))=lower(nm)
   AND (x.checked_in_at AT TIME ZONE 'America/New_York')::date=(tsin AT TIME ZONE 'America/New_York')::date) THEN RAISE EXCEPTION 'CONFLICT_REFRESH';END IF;
  INSERT INTO public.ehe_service(booking_id,checked_in_at,checked_out_at,source,visit_person_id,visit_event_id,visit_name,visit_email,visit_name_key,visit_date,visit_role,visit_identity,visit_origin)
  VALUES(bid,tsin,tsout,'staff_corrected',pid,evt,nm,em,lower(regexp_replace(nm,'\s+',' ','g')),(tsin AT TIME ZONE 'America/New_York')::date,rl,CASE WHEN pid IS NULL THEN 'unlinked' ELSE 'matched' END,CASE WHEN bid IS NULL THEN 'walk_in' ELSE 'pre_registered' END) RETURNING * INTO l;
  IF details_edit THEN
  UPDATE public.ehe_service SET visit_name=nm,visit_email=em,visit_name_key=lower(regexp_replace(nm,'[[:space:]]+',' ','g')),visit_date=(tsin AT TIME ZONE 'America/New_York')::date,
   visit_shift_id=CASE WHEN evt IS DISTINCT FROM coalesce(l.visit_event_id,(SELECT s.event_id FROM public.ehe_bookings b JOIN public.ehe_shifts s ON s.id=b.shift_id WHERE b.id=l.booking_id)) THEN NULL ELSE l.visit_shift_id END,
   needs_support=(p_data->>'needs_support')::boolean,support_details=coalesce(p_data->>'support_details',''),duties=duties_value,observations=observations_value,duty_other=coalesce(p_data->>'duty_other',''),observation_other=coalesce(p_data->>'observation_other',''),specific_observations=coalesce(p_data->>'specific_observations',''),went_well=coalesce(p_data->>'went_well',''),improvements=coalesce(p_data->>'improvements','') WHERE id=l.id;
 END IF;
 result:=jsonb_build_object('ok',true,'service_id',l.id);
  INSERT INTO public.ehe_volunteer_visit_requests(request_id,kind,payload,outcome,service_id) VALUES(req,'correct',p_data||jsonb_build_object('actor',p_actor),result,l.id);
  INSERT INTO public.ehe_audit(actor_id,action,target,details) VALUES(p_actor,'volunteer_visit_manually_added',l.id::text,jsonb_build_object('reason',p_data->>'reason','event_id',evt));
  RETURN result;
 END IF;
 SELECT * INTO l FROM public.ehe_service WHERE id=(p_data->>'service_id')::uuid AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF l.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'CONFLICT_REFRESH'; END IF;
 tsin:=(p_data->>'in_local')::timestamp AT TIME ZONE 'America/New_York';tsout:=nullif(p_data->>'out_local','')::timestamp AT TIME ZONE 'America/New_York';
 IF tsin IS NULL OR tsin>now() OR tsout>now() OR tsout<tsin THEN RAISE EXCEPTION 'INVALID_TIME';END IF;
 evt:=nullif(p_data->>'event_id','');rl:=nullif(p_data->>'role','');
 IF evt IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ehe_events WHERE id=evt AND event_date=(tsin AT TIME ZONE 'America/New_York')::date) THEN RAISE EXCEPTION 'EVENT_DATE_MISMATCH'; END IF;
 IF rl IS NOT NULL AND rl NOT IN ('registration','survey','participant_support','teaching','logistics','photo_video','staff','other','other_text') THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 IF NOT details_edit AND l.booking_id IS NOT NULL THEN SELECT s.event_id INTO old_event FROM public.ehe_bookings b JOIN public.ehe_shifts s ON s.id=b.shift_id WHERE b.id=l.booking_id;IF evt IS DISTINCT FROM old_event THEN RAISE EXCEPTION 'VISIT_CONTEXT_MISMATCH';END IF;END IF;
 INSERT INTO public.ehe_audit(actor_id,action,target,details) VALUES(p_actor,'volunteer_visit_before_correction',l.id::text,jsonb_build_object('previous',to_jsonb(l),'reason',p_data->>'reason'));
 UPDATE public.ehe_service SET checked_in_at=tsin,checked_out_at=tsout,visit_date=(tsin AT TIME ZONE 'America/New_York')::date,visit_event_id=evt,visit_role=rl,visit_shift_id=CASE WHEN l.booking_id IS NULL AND evt IS DISTINCT FROM l.visit_event_id THEN NULL ELSE l.visit_shift_id END,source='staff_corrected',version=version+1 WHERE id=l.id;
 IF details_edit THEN
  UPDATE public.ehe_service SET visit_name=nm,visit_email=em,visit_name_key=lower(regexp_replace(nm,'[[:space:]]+',' ','g')),visit_date=(tsin AT TIME ZONE 'America/New_York')::date,
   visit_shift_id=CASE WHEN evt IS DISTINCT FROM coalesce(l.visit_event_id,(SELECT s.event_id FROM public.ehe_bookings b JOIN public.ehe_shifts s ON s.id=b.shift_id WHERE b.id=l.booking_id)) THEN NULL ELSE l.visit_shift_id END,
   needs_support=(p_data->>'needs_support')::boolean,support_details=coalesce(p_data->>'support_details',''),duties=duties_value,observations=observations_value,duty_other=coalesce(p_data->>'duty_other',''),observation_other=coalesce(p_data->>'observation_other',''),specific_observations=coalesce(p_data->>'specific_observations',''),went_well=coalesce(p_data->>'went_well',''),improvements=coalesce(p_data->>'improvements','') WHERE id=l.id;
 END IF;
 result:=jsonb_build_object('ok',true,'service_id',l.id);
 INSERT INTO public.ehe_volunteer_visit_requests(request_id,kind,payload,outcome,service_id) VALUES(req,'correct',p_data||jsonb_build_object('actor',p_actor),result,l.id);
 INSERT INTO public.ehe_audit(actor_id,action,target,details) VALUES(p_actor,'volunteer_visit_corrected',l.id::text,jsonb_build_object('event_id',evt,'reason',p_data->>'reason'));
 RETURN result;
END $function$

;
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

;
CREATE OR REPLACE FUNCTION public.ehe_staff_command_core(p_actor uuid, p_email text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.ehe_shifts; b public.ehe_bookings; e public.ehe_events; p public.ehe_people; n integer; bid uuid; eid uuid; ident text; target text; result jsonb:='{"ok":true}'; roles text; vstart timestamptz; vend timestamptz;
begin
 -- full_staff_role_guard_v12
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.ehe_staff WHERE email=p_email AND active AND access_role IN ('admin','staff')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 perform pg_advisory_xact_lock(612614060);
 select access_role into roles from public.ehe_staff where email=p_email and active;
 if p_actor is null or roles is null then raise exception 'FORBIDDEN'; end if;
 if p_action='snapshot' then
 return jsonb_build_object('role',roles,'server_time',now(),
 'people',coalesce((select jsonb_agg(to_jsonb(x) order by name) from public.ehe_people x),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(x) order by event_date) from public.ehe_events x),'[]'::jsonb),
 'shifts',coalesce((select jsonb_agg(to_jsonb(x) order by starts_at) from public.ehe_shifts x),'[]'::jsonb),
 'bookings',coalesce((select jsonb_agg(to_jsonb(x) order by created_at) from public.ehe_bookings x),'[]'::jsonb),
 'service',coalesce((select jsonb_agg(to_jsonb(x)) from public.ehe_service x where deleted_at is null),'[]'::jsonb),
 'deleted_service',coalesce((select jsonb_agg(to_jsonb(x)) from public.ehe_service x where deleted_at is not null),'[]'::jsonb),
 'enrollments',coalesce((select jsonb_agg(to_jsonb(x)) from public.ehe_enrollments x),'[]'::jsonb),
 'attendance',coalesce((select jsonb_agg(to_jsonb(x)) from public.ehe_attendance x),'[]'::jsonb),
 'diaries',coalesce((select jsonb_agg(to_jsonb(x)) from public.ehe_diaries x),'[]'::jsonb),
 'reviews',coalesce((select jsonb_agg(to_jsonb(x)) from public.ehe_submissions x where review_status<>'none'),'[]'::jsonb));
 elsif p_action='save_event' then
 ident:=coalesce(nullif(p_data->>'id',''),'EV-'||gen_random_uuid()::text);
 if exists(select 1 from public.ehe_events where id=ident) then
 select * into e from public.ehe_events where id=ident for update;
 if e.updated_at is distinct from nullif(p_data->>'version','')::timestamptz then raise exception 'CONFLICT_REFRESH'; end if;
 if (p_data->>'event_date')::date<>e.event_date and exists(select 1 from public.ehe_shifts where event_id=ident) then raise exception 'EVENT_HAS_SHIFTS'; end if;
 end if;
 insert into public.ehe_events(id,name_zh,name_en,event_date,event_type,cycle_code,location,diary_health,diary_bp,published)
 values(ident,trim(p_data->>'name_zh'),coalesce(p_data->>'name_en',''),(p_data->>'event_date')::date,p_data->>'event_type',coalesce(p_data->>'cycle_code',''),coalesce(p_data->>'location',''),coalesce((p_data->>'diary_health')::boolean,false) and p_data->>'event_type'='course',coalesce((p_data->>'diary_bp')::boolean,false) and p_data->>'event_type'='course',coalesce((p_data->>'published')::boolean,false))
 on conflict(id) do update set name_zh=excluded.name_zh,name_en=excluded.name_en,event_date=excluded.event_date,event_type=excluded.event_type,cycle_code=excluded.cycle_code,location=excluded.location,diary_health=excluded.diary_health,diary_bp=excluded.diary_bp,published=excluded.published,updated_at=clock_timestamp();
 if p_data ? 'session_start' or p_data ? 'session_end' then update public.ehe_events set session_start=nullif(p_data->>'session_start','')::time,session_end=nullif(p_data->>'session_end','')::time where id=ident; end if;
 result:=jsonb_build_object('id',ident); target:=ident;
 elsif p_action='save_shift' then
 select * into e from public.ehe_events where id=p_data->>'event_id'; if not found then raise exception 'EVENT_REQUIRED'; end if;
 ident:=coalesce(nullif(p_data->>'id',''),'SH-'||gen_random_uuid()::text);
 vstart:=case when nullif(p_data->>'start','') is null then null else (e.event_date::text||' '||(p_data->>'start'))::timestamp at time zone 'America/New_York' end;
 vend:=case when nullif(p_data->>'end','') is null then null else (e.event_date::text||' '||(p_data->>'end'))::timestamp at time zone 'America/New_York' end; if (vstart is null)<>(vend is null) or (coalesce((p_data->>'published')::boolean,false) and (vstart is null or vend<=now())) then raise exception 'INVALID_TIME'; end if;
 if exists(select 1 from public.ehe_shifts where id=ident) then
 select * into s from public.ehe_shifts where id=ident for update;
 if s.deleted_at is not null then raise exception 'CONFLICT_REFRESH'; end if;
 if s.updated_at is distinct from nullif(p_data->>'version','')::timestamptz then raise exception 'CONFLICT_REFRESH'; end if;
 if (s.starts_at is distinct from vstart or s.ends_at is distinct from vend or s.event_id<>e.id or s.duty<>p_data->>'duty') and exists(select 1 from public.ehe_bookings where shift_id=s.id and status<>'cancelled') then raise exception 'BOOKED_SHIFT_LOCKED'; end if;
 select count(*) into n from public.ehe_bookings where shift_id=ident and status='confirmed'; if n>(p_data->>'capacity')::integer then raise exception 'CAPACITY_BELOW_BOOKINGS'; end if;
 end if;
 insert into public.ehe_shifts(id,event_id,duty,starts_at,ends_at,capacity,requires_approval,published,description_zh,description_en,requirements_zh,requirements_en)
 values(ident,e.id,p_data->>'duty',vstart,vend,(p_data->>'capacity')::integer,coalesce((p_data->>'requires_approval')::boolean,false),coalesce((p_data->>'published')::boolean,false),coalesce(p_data->>'description_zh',''),coalesce(p_data->>'description_en',''),coalesce(p_data->>'requirements_zh',''),coalesce(p_data->>'requirements_en',''))
 on conflict(id) do update set event_id=excluded.event_id,duty=excluded.duty,starts_at=excluded.starts_at,ends_at=excluded.ends_at,capacity=excluded.capacity,requires_approval=excluded.requires_approval,published=excluded.published,description_zh=excluded.description_zh,description_en=excluded.description_en,requirements_zh=excluded.requirements_zh,requirements_en=excluded.requirements_en,updated_at=clock_timestamp();
 result:=jsonb_build_object('id',ident); target:=ident;
 elsif p_action='booking_status' then
 select * into b from public.ehe_bookings where id=(p_data->>'id')::uuid; if not found then raise exception 'NOT_FOUND'; end if;
 select * into s from public.ehe_shifts where id=b.shift_id for update;
 select * into b from public.ehe_bookings where id=b.id for update;
 perform pg_advisory_xact_lock(hashtextextended('volunteer:'||(select email from public.ehe_people where id=b.person_id),0));
 if b.version<>coalesce((p_data->>'version')::integer,-1) then raise exception 'CONFLICT_REFRESH'; end if;
 if exists(select 1 from public.ehe_service where booking_id=b.id) then raise exception 'SERVICE_ALREADY_STARTED'; end if;
 if p_data->>'status'='confirmed' then
 if s.deleted_at is not null then raise exception 'SHIFT_UNAVAILABLE'; end if;
 if b.status not in ('waitlist','pending') or now()>=s.ends_at then raise exception 'INVALID_STATUS'; end if;
 select count(*) into n from public.ehe_bookings where shift_id=s.id and status='confirmed'; if n>=s.capacity then raise exception 'FULL'; end if;
 if b.status='waitlist' and b.id<>(select id from public.ehe_bookings where shift_id=s.id and status='waitlist' order by created_at,id limit 1) then raise exception 'WAITLIST_ORDER'; end if;
 if exists(select 1 from public.ehe_bookings ob join public.ehe_shifts os on os.id=ob.shift_id where os.deleted_at is null and ob.person_id=b.person_id and ob.id<>b.id and ob.status in ('confirmed','pending') and os.starts_at<s.ends_at and os.ends_at>s.starts_at) then raise exception 'OVERLAP'; end if;
 elsif p_data->>'status'<>'cancelled' then raise exception 'INVALID_STATUS'; end if;
 update public.ehe_bookings set status=p_data->>'status',updated_at=clock_timestamp(),version=version+1 where id=b.id; target:=b.id::text;
 elsif p_action='new_participant' then
 insert into public.ehe_people(kind,name,alias,preferred_language,joined_on,source_ref) values('participant',trim(p_data->>'name'),coalesce(p_data->>'alias',''),coalesce(p_data->>'preferred_language',''),(now() at time zone 'America/New_York')::date,'website') returning id into ident;
 insert into public.ehe_enrollments(person_id,event_id,entry_method,registered_at) values(ident,p_data->>'event_id','new_on_site',now()) returning id into eid;
 if coalesce((p_data->>'checkin')::boolean,false) then insert into public.ehe_attendance(enrollment_id,status,checked_in_at,recorded_by) values(eid,'checked_in',now(),p_actor); end if;
 result:=jsonb_build_object('person_id',ident);target:=ident;
 elsif p_action='enroll_participant' then
 select * into p from public.ehe_people where id=p_data->>'person_id' and kind='participant' for update; if not found then raise exception 'NOT_FOUND'; end if;
 if p_data->>'entry_method' not in ('walk_in','returning_registration') then raise exception 'INVALID_INPUT'; end if;
 insert into public.ehe_enrollments(person_id,event_id,entry_method,registered_at) values(p.id,p_data->>'event_id',p_data->>'entry_method',now()) on conflict(person_id,event_id) do nothing;
 select id into eid from public.ehe_enrollments where person_id=p.id and event_id=p_data->>'event_id';
 if coalesce((p_data->>'checkin')::boolean,false) then insert into public.ehe_attendance(enrollment_id,status,checked_in_at,recorded_by) values(eid,'checked_in',now(),p_actor) on conflict(enrollment_id) where not voided do nothing; end if;target:=eid::text;
 elsif p_action='participant_checkin' then
 eid:=(p_data->>'enrollment_id')::uuid;
 insert into public.ehe_attendance(enrollment_id,status,checked_in_at,recorded_by) values(eid,'checked_in',now(),p_actor) on conflict(enrollment_id) where not voided do nothing;target:=eid::text;
 elsif p_action='void_attendance' then
 if length(trim(coalesce(p_data->>'reason','')))<2 then raise exception 'REASON_REQUIRED'; end if;
 update public.ehe_attendance set voided=true,void_reason=left(p_data->>'reason',500) where id=(p_data->>'id')::uuid and not voided;target:=p_data->>'id';
 elsif p_action='save_participant' then
 select * into p from public.ehe_people where id=p_data->>'id' and kind='participant' for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if p.updated_at is distinct from nullif(p_data->>'version','')::timestamptz then raise exception 'CONFLICT_REFRESH'; end if;
 update public.ehe_people set name=trim(p_data->>'name'),alias=coalesce(p_data->>'alias',''),preferred_language=coalesce(p_data->>'preferred_language',''),email=nullif(lower(trim(p_data->>'email')),''),phone=left(coalesce(p_data->>'phone',''),40),profile_status=case when (p_data->>'reviewed')::boolean then 'reviewed' else 'incomplete' end,updated_at=clock_timestamp() where id=p.id;target:=p.id;
 elsif p_action='diary' then
 eid:=(p_data->>'enrollment_id')::uuid;
 select ev.* into e from public.ehe_enrollments en join public.ehe_events ev on ev.id=en.event_id where en.id=eid;
 if not found or e.event_type<>'course' or (p_data->>'field'='health' and not e.diary_health) or (p_data->>'field'='bp' and not e.diary_bp) or p_data->>'field' not in ('health','bp') then raise exception 'DIARY_NOT_APPLICABLE'; end if;
 insert into public.ehe_diaries(enrollment_id,updated_by) values(eid,p_actor) on conflict do nothing;
 if p_data->>'field'='health' then update public.ehe_diaries set health_received=(p_data->>'received')::boolean,updated_at=clock_timestamp(),updated_by=p_actor where enrollment_id=eid;
 else update public.ehe_diaries set bp_received=(p_data->>'received')::boolean,updated_at=clock_timestamp(),updated_by=p_actor where enrollment_id=eid; end if;target:=eid::text;
 elsif p_action='review_submission' then
 if p_data->>'status' not in ('resolved','dismissed') or length(trim(coalesce(p_data->>'note','')))<2 then raise exception 'REASON_REQUIRED'; end if;
 update public.ehe_submissions set review_status=p_data->>'status',review_note=left(p_data->>'note',2000),reviewed_by=p_actor where request_id=(p_data->>'id')::uuid and review_status='pending';target:=p_data->>'id';
 elsif p_action='correct_service' then
 bid:=(p_data->>'booking_id')::uuid;
 select * into b from public.ehe_bookings where id=bid and status='confirmed' for update; if not found then raise exception 'NO_CONFIRMED_BOOKING'; end if;
 if length(trim(coalesce(p_data->>'reason','')))<2 then raise exception 'REASON_REQUIRED'; end if;
 if exists(select 1 from public.ehe_service where booking_id=bid and version<>coalesce((p_data->>'version')::integer,0)) then raise exception 'CONFLICT_REFRESH'; end if;
 vstart:=case when p_data ? 'in_local' then (p_data->>'in_local')::timestamp at time zone 'America/New_York' else (p_data->>'checked_in_at')::timestamptz end; vend:=case when p_data ? 'out_local' then nullif(p_data->>'out_local','')::timestamp at time zone 'America/New_York' else nullif(p_data->>'checked_out_at','')::timestamptz end;
 if vstart is null or vstart>now() or vend>now() then raise exception 'INVALID_TIME'; end if;
 insert into public.ehe_audit(actor_id,action,target,details) select p_actor,'service_before_correction',bid::text,jsonb_build_object('previous',to_jsonb(x),'reason',p_data->>'reason') from public.ehe_service x where booking_id=bid;
 insert into public.ehe_service(booking_id,checked_in_at,checked_out_at,source) values(bid,vstart,vend,'staff_corrected') on conflict(booking_id) do update set checked_in_at=excluded.checked_in_at,checked_out_at=excluded.checked_out_at,source='staff_corrected',version=ehe_service.version+1;target:=bid::text;
 else raise exception 'UNKNOWN_ACTION'; end if;
 insert into public.ehe_audit(actor_id,action,target,details) values(p_actor,p_action,target,jsonb_build_object('reason',p_data->>'reason','field',p_data->>'field','status',p_data->>'status'));
 return result;
end $function$

;
CREATE OR REPLACE FUNCTION public.ehe_self_command(p_actor uuid, p_email text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare p public.ehe_people; b public.ehe_bookings; s public.ehe_shifts; n integer;
begin
 perform pg_advisory_xact_lock(612614060);
 if p_actor is null then raise exception 'FORBIDDEN'; end if;
 select count(*) into n from public.ehe_people where kind='volunteer' and email=p_email;
 if n<>1 then return jsonb_build_object('needs_staff_help',true,'bookings','[]'::jsonb); end if;
 select * into p from public.ehe_people where kind='volunteer' and email=p_email;
 if p_action='list' then
 return jsonb_build_object('person',jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'languages',p.languages,'language_other',p.language_other),'bookings',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'version',b.version,'shift',to_jsonb(s),'event',to_jsonb(e),'service',to_jsonb(l)) order by s.starts_at desc) from public.ehe_bookings b join public.ehe_shifts s on s.id=b.shift_id join public.ehe_events e on e.id=s.event_id left join public.ehe_service l on l.booking_id=b.id and l.deleted_at is null where b.person_id=p.id),'[]'::jsonb));
 elsif p_action='cancel' then
 select * into b from public.ehe_bookings where id=(p_data->>'id')::uuid and person_id=p.id; if not found then raise exception 'NOT_FOUND'; end if;
 select * into s from public.ehe_shifts where id=b.shift_id for update;
 select * into b from public.ehe_bookings where id=b.id for update;
 if now()>=s.starts_at or exists(select 1 from public.ehe_service where booking_id=b.id) then raise exception 'CONTACT_STAFF_TO_CANCEL'; end if;
 update public.ehe_bookings set status='cancelled',version=version+1,updated_at=clock_timestamp() where id=b.id;
 insert into public.ehe_audit(actor_id,action,target) values(p_actor,'self_cancel',b.id::text); return '{"ok":true}'::jsonb;
 else raise exception 'UNKNOWN_ACTION'; end if;
end $function$

;

DROP INDEX public.ehe_service_open_visit_idx;
CREATE UNIQUE INDEX ehe_service_open_visit_idx ON public.ehe_service(visit_email,visit_name_key,visit_date) WHERE checked_out_at IS NULL AND visit_email IS NOT NULL AND deleted_at IS NULL;
CREATE OR REPLACE FUNCTION public.ehe_catalog()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('server_time',now(),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.event_date) FROM public.ehe_events e WHERE e.published),'[]'::jsonb),
 'shifts',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.starts_at) FROM (
  SELECT s.*,
    (SELECT count(*) FROM public.ehe_bookings b WHERE b.shift_id=s.id AND b.status='confirmed') AS confirmed_count,
    (SELECT count(*) FROM public.ehe_bookings b WHERE b.shift_id=s.id AND b.status='waitlist') AS waitlist_count,
    (SELECT count(*) FROM public.ehe_bookings b WHERE b.shift_id=s.id AND b.status='pending') AS pending_count
  FROM public.ehe_shifts s JOIN public.ehe_events e ON e.id=s.event_id
  WHERE s.deleted_at IS NULL AND s.published AND e.published AND s.ends_at>now()-interval '12 hours'
  ORDER BY s.starts_at LIMIT 500
 ) x),'[]'::jsonb))
$function$
;
CREATE OR REPLACE FUNCTION public.ehe_publish_event_shifts(p_actor uuid, p_email text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare ev public.ehe_events; s public.ehe_shifts; n integer:=0; meet text; expected jsonb;
begin
 -- full_staff_role_guard_v12
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.ehe_staff WHERE email=p_email AND active AND access_role IN ('admin','staff')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 if p_actor is null or not exists(select 1 from public.ehe_staff where email=p_email and active) then raise exception 'FORBIDDEN'; end if;
 perform pg_advisory_xact_lock(612614060);
 select * into ev from public.ehe_events where id=p_data->>'id' for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 if ev.updated_at is distinct from nullif(p_data->>'version','')::timestamptz then raise exception 'CONFLICT_REFRESH'; end if;
 expected:=p_data->'shift_versions';
 if expected is null or jsonb_typeof(expected)<>'object' then raise exception 'INVALID_INPUT'; end if;
 if (select count(*) from jsonb_object_keys(expected))<>(select count(*) from public.ehe_shifts where event_id=ev.id and deleted_at is null) then raise exception 'CONFLICT_REFRESH'; end if;
 for s in select * from public.ehe_shifts where event_id=ev.id and deleted_at is null order by id for update loop
  if s.updated_at is distinct from nullif(expected->>s.id,'')::timestamptz then raise exception 'CONFLICT_REFRESH'; end if;
  if s.starts_at is null or s.ends_at is null or s.ends_at<=now() or (s.starts_at at time zone 'America/New_York')::date<>ev.event_date then raise exception 'INVALID_TIME'; end if;
  meet:=coalesce(nullif(substring(s.description_en from '(?n)^Meeting point:[ ]*([^\n\r]+)'),''),nullif(substring(s.description_zh from '(?n)^集合地點：[ ]*([^\n\r]+)'),''),nullif(ev.location,''));
  if meet is null or meet ~* '(TBD|to be confirmed|待確認|待定)' then raise exception 'INVALID_INPUT'; end if;
  n:=n+1;
 end loop;
 if n=0 then raise exception 'SHIFT_UNAVAILABLE'; end if;
 update public.ehe_events set published=true,updated_at=clock_timestamp() where id=ev.id;
 update public.ehe_shifts set published=true,updated_at=clock_timestamp() where event_id=ev.id and deleted_at is null;
 insert into public.ehe_audit(actor_id,action,target,details) values(p_actor,'publish_event_shifts',ev.id,jsonb_build_object('count',n));
 return jsonb_build_object('id',ev.id,'published_shifts',n);
end $function$
;
CREATE OR REPLACE FUNCTION public.ehe_submit(p_request uuid, p_kind text, p_shift text, p_name text, p_email text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s public.ehe_shifts; p public.ehe_people; b public.ehe_bookings; l public.ehe_service; prior public.ehe_submissions; reason text; st text; result jsonb:='{"status":"received"}'; matches integer; email_matches integer; taken integer; lang text[]; pid text;
begin
 perform pg_advisory_xact_lock(612614060);
 if p_request is null or p_kind is null or p_shift is null or p_name is null or p_email is null or p_data is null or p_kind not in ('signup','in','out') or length(trim(p_name)) not between 1 and 120 or length(p_email)>254 or p_email!~'^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or p_email<>lower(trim(p_email)) or jsonb_typeof(p_data)<>'object' or length(p_data::text)>12000 then raise exception 'INVALID_INPUT'; end if;
 perform pg_advisory_xact_lock(hashtextextended('request:'||p_request::text,0));
 select * into prior from public.ehe_submissions where request_id=p_request;
 if found then
 if prior.kind<>p_kind or prior.shift_id<>p_shift or prior.payload->>'name'<>p_name or prior.payload->>'email'<>p_email or prior.payload->'data' is distinct from p_data then raise exception 'REQUEST_REUSED'; end if;
 return prior.outcome;
 end if;
 select * into s from public.ehe_shifts where id=p_shift for update;
 if not found or s.deleted_at is not null or not s.published or not exists(select 1 from public.ehe_events where id=s.event_id and published) then raise exception 'SHIFT_UNAVAILABLE'; end if;
 if p_kind='signup' and now()>=s.ends_at then raise exception 'SHIFT_ENDED'; end if;
 if p_kind in ('in','out') and (now()<s.starts_at-interval '2 hours' or now()>s.ends_at+interval '8 hours') then reason:='Outside the shift check-in/out window'; end if;
 perform pg_advisory_xact_lock(hashtextextended('volunteer:'||p_email,0));
 select count(*) into matches from public.ehe_people where kind='volunteer' and email=p_email and (lower(regexp_replace(trim(name),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g')) or lower(regexp_replace(trim(alias),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g')));
 select count(*) into email_matches from public.ehe_people where kind='volunteer' and email=p_email;
 if matches=1 and email_matches=1 then
 select * into p from public.ehe_people where kind='volunteer' and email=p_email for update;
 elsif p_kind='signup' and email_matches=0 and reason is null then
 select coalesce(array_agg(value),'{}') into lang from jsonb_array_elements_text(coalesce(p_data->'languages','[]'));
 if cardinality(lang)>12 or not lang<@array['Mandarin','Cantonese','Toishanese','English','Spanish','Other']::text[] or length(coalesce(p_data->>'language_other',''))>120 then raise exception 'INVALID_LANGUAGES'; end if;
 insert into public.ehe_people(kind,name,email,languages,language_other,joined_on,profile_status,source_ref) values('volunteer',trim(p_name),p_email,lang,coalesce(p_data->>'language_other',''),(now() at time zone 'America/New_York')::date,'basic','website_signup') returning * into p;
 else reason:=coalesce(reason,'Name/email match requires staff review'); end if;
 if p.id is not null then select * into b from public.ehe_bookings where person_id=p.id and shift_id=s.id and status<>'cancelled' for update; end if;
 if reason is null and p_kind='signup' and b.id is null then
 select count(*) into taken from public.ehe_bookings where shift_id=s.id and status='confirmed';
 st:=case when taken>=s.capacity or exists(select 1 from public.ehe_bookings where shift_id=s.id and status='waitlist') then 'waitlist' when s.requires_approval then 'pending' else 'confirmed' end;
 if st in ('pending','confirmed') and exists(select 1 from public.ehe_bookings ob join public.ehe_shifts os on os.id=ob.shift_id where os.deleted_at is null and ob.person_id=p.id and ob.status in ('confirmed','pending') and os.starts_at<s.ends_at and os.ends_at>s.starts_at) then reason:='Overlapping shift requires review';
 else insert into public.ehe_bookings(person_id,shift_id,status) values(p.id,s.id,st) returning * into b; result:=jsonb_build_object('status',st,'booking_id',b.id); end if;
 elsif reason is null and p_kind in ('in','out') then
 if b.id is null or b.status<>'confirmed' then reason:='No confirmed booking to match';
 else
 select * into l from public.ehe_service where booking_id=b.id for update;
 if p_kind='in' then
 if l.id is not null then reason:='Repeated check-in; original preserved';
 elsif not (p_data ? 'needs_support') or jsonb_typeof(p_data->'needs_support')<>'boolean' then raise exception 'SUPPORT_REQUIRED';
 else insert into public.ehe_service(booking_id,checked_in_at,needs_support,support_details) values(b.id,now(),(p_data->>'needs_support')::boolean,left(coalesce(p_data->>'support_details',''),1500)); end if;
 else
 if l.id is null then reason:='Checkout without matched check-in';
 elsif l.checked_out_at is not null then reason:='Repeated checkout; original preserved';
 elsif jsonb_array_length(coalesce(p_data->'duties','[]'))<1 then raise exception 'DUTY_REQUIRED';
 else update public.ehe_service set checked_out_at=now(),duties=array(select jsonb_array_elements_text(p_data->'duties')),duty_other=left(coalesce(p_data->>'duty_other',''),300),observations=array(select jsonb_array_elements_text(coalesce(p_data->'observations','[]'))),observation_other=left(coalesce(p_data->>'observation_other',''),600),specific_observations=left(coalesce(p_data->>'specific_observations',''),2000),went_well=left(coalesce(p_data->>'went_well',''),2000),improvements=left(coalesce(p_data->>'improvements',''),2000),version=version+1 where id=l.id; end if;
 end if;
 end if;
 end if;
 insert into public.ehe_submissions(request_id,kind,shift_id,payload,outcome,review_reason,review_status) values(p_request,p_kind,p_shift,jsonb_build_object('name',p_name,'email',p_email,'data',p_data),result,reason,case when reason is null then 'none' else 'pending' end);
 insert into public.ehe_audit(action,target,details) values('volunteer_'||p_kind,p_request::text,jsonb_build_object('shift_id',p_shift,'requires_review',reason is not null));
 return result;
end $function$
;

