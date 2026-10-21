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
 IF details_edit THEN
  nm:=btrim(normalize(coalesce(p_data->>'name',''),NFKC));em:=lower(btrim(coalesce(p_data->>'email','')));
  IF length(nm) NOT BETWEEN 1 AND 120 OR length(em)>254 OR em !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' OR jsonb_typeof(p_data->'duties') IS DISTINCT FROM 'array' OR jsonb_typeof(p_data->'observations') IS DISTINCT FROM 'array' OR jsonb_typeof(p_data->'needs_support') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  SELECT coalesce(array_agg(DISTINCT value),'{}') INTO duties_value FROM jsonb_array_elements_text(p_data->'duties');
  SELECT coalesce(array_agg(DISTINCT value),'{}') INTO observations_value FROM jsonb_array_elements_text(p_data->'observations');
  IF NOT duties_value<@ARRAY['registration','survey','participant_support','teaching','logistics','photo_video','other','other_text']::text[] OR NOT observations_value<@ARRAY['questions','answer','practice','support','listen','declined','nochance','unknown','other_text']::text[] OR length(coalesce(p_data->>'support_details',''))>1500 OR length(coalesce(p_data->>'duty_other',''))>300 OR length(coalesce(p_data->>'observation_other',''))>600 OR length(coalesce(p_data->>'specific_observations',''))>2000 OR length(coalesce(p_data->>'went_well',''))>2000 OR length(coalesce(p_data->>'improvements',''))>2000 THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
 END IF;
 IF coalesce((p_data->>'manual_new')::boolean,false) OR coalesce((p_data->>'manual_booking')::boolean,false) THEN
  nm:=btrim(normalize(coalesce(p_data->>'name',''),NFKC));em:=lower(btrim(coalesce(p_data->>'email','')));pid:=nullif(p_data->>'person_id','');
  IF length(nm)<1 OR length(nm)>120 OR length(em)>254 OR em !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  IF NOT details_edit AND pid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ehe_people WHERE id=pid AND kind='volunteer' AND lower(btrim(email))=em AND btrim(normalize(name,NFKC))=nm) THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  IF coalesce((p_data->>'manual_booking')::boolean,false) THEN
   bid:=(p_data->>'booking_id')::uuid;
   SELECT b.person_id INTO pid FROM public.ehe_bookings b WHERE b.id=bid AND b.status='confirmed' FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
   IF EXISTS(SELECT 1 FROM public.ehe_service WHERE booking_id=bid) THEN RAISE EXCEPTION 'CONFLICT_REFRESH';END IF;
  END IF;
  tsin:=(p_data->>'in_local')::timestamp AT TIME ZONE 'America/New_York';tsout:=nullif(p_data->>'out_local','')::timestamp AT TIME ZONE 'America/New_York';
  IF tsin IS NULL OR tsin>now() OR tsout>now() OR tsout<tsin THEN RAISE EXCEPTION 'INVALID_TIME';END IF;
  evt:=nullif(p_data->>'event_id','');rl:=nullif(p_data->>'role','');
  IF evt IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ehe_events WHERE id=evt AND event_date=(tsin AT TIME ZONE 'America/New_York')::date) THEN RAISE EXCEPTION 'EVENT_DATE_MISMATCH';END IF;
  IF rl IS NOT NULL AND rl NOT IN ('registration','survey','participant_support','teaching','logistics','photo_video','other','other_text') THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
  -- A missing visit must not duplicate an existing visit, including a booked one.
  IF EXISTS(SELECT 1 FROM public.ehe_service x LEFT JOIN public.ehe_bookings b ON b.id=x.booking_id LEFT JOIN public.ehe_people p ON p.id=b.person_id
   WHERE lower(btrim(coalesce(x.visit_email,p.email)))=em
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
 SELECT * INTO l FROM public.ehe_service WHERE id=(p_data->>'service_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF l.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'CONFLICT_REFRESH'; END IF;
 tsin:=(p_data->>'in_local')::timestamp AT TIME ZONE 'America/New_York';tsout:=nullif(p_data->>'out_local','')::timestamp AT TIME ZONE 'America/New_York';
 IF tsin IS NULL OR tsin>now() OR tsout>now() OR tsout<tsin THEN RAISE EXCEPTION 'INVALID_TIME';END IF;
 evt:=nullif(p_data->>'event_id','');rl:=nullif(p_data->>'role','');
 IF evt IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.ehe_events WHERE id=evt AND event_date=(tsin AT TIME ZONE 'America/New_York')::date) THEN RAISE EXCEPTION 'EVENT_DATE_MISMATCH'; END IF;
 IF rl IS NOT NULL AND rl NOT IN ('registration','survey','participant_support','teaching','logistics','photo_video','other','other_text') THEN RAISE EXCEPTION 'INVALID_INPUT';END IF;
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
