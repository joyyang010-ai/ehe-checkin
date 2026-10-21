BEGIN;

DO $qa$
DECLARE actor uuid; mail text; data jsonb; created jsonb; sid uuid; pid text; evt text; other_evt text; sh text; bid uuid; day date:=(now() AT TIME ZONE 'America/New_York')::date-3; start_time text; rejected boolean; public_result jsonb; qa_name text:='FICTIONAL AUTO QA '||gen_random_uuid()::text; qa_email text:='qa-auto-'||gen_random_uuid()::text||'@example.invalid';
BEGIN
 SELECT u.id,st.email INTO actor,mail FROM public.ehe_staff st JOIN auth.users u ON lower(u.email)=st.email WHERE st.active AND st.access_role='admin' AND u.email_confirmed_at IS NOT NULL LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'QA admin missing';END IF;
 public_result:=public.ehe_record_volunteer_visit(gen_random_uuid(),'in',qa_name,qa_email);
 IF public_result->>'recorded'<>'true' OR public_result->>'requires_review'<>'false' OR public_result->>'status'<>'checked_in' OR NOT EXISTS(SELECT 1 FROM public.ehe_service WHERE id=(public_result->>'service_id')::uuid) THEN RAISE EXCEPTION 'Automatic check-in did not record immediately';END IF;
 public_result:=public.ehe_record_volunteer_visit(gen_random_uuid(),'out',qa_name,qa_email);
 IF public_result->>'recorded'<>'true' OR public_result->>'requires_review'<>'false' OR public_result->>'status'<>'checked_out' THEN RAISE EXCEPTION 'Automatic checkout failed';END IF;
 INSERT INTO public.ehe_people(kind,name,email,profile_status) VALUES('volunteer','FICTIONAL BOOKING QA','qa-booking@example.invalid','basic') RETURNING id INTO pid;
 INSERT INTO public.ehe_events(name_zh,event_date,event_type) VALUES('FICTIONAL QA',day,'special') RETURNING id INTO evt;
 INSERT INTO public.ehe_events(name_zh,event_date,event_type) VALUES('FICTIONAL QA correction event',day,'special') RETURNING id INTO other_evt;
 INSERT INTO public.ehe_shifts(event_id,duty,capacity) VALUES(evt,'logistics',5) RETURNING id INTO sh;
 INSERT INTO public.ehe_bookings(person_id,shift_id,status) VALUES(pid,sh,'confirmed') RETURNING id INTO bid;
 start_time:=day::text||'T13:00';
 data:=jsonb_build_object('edit_details',true,'manual_booking',true,'booking_id',bid,'version',0,'request_id',gen_random_uuid(),'name','FICTIONAL BOOKING QA','email','qa-booking@example.invalid','in_local',start_time,'out_local',day::text||'T15:00','event_id',evt,'role','logistics','reason','QA rollback manual booking','needs_support',true,'support_details','QA support','duties',jsonb_build_array('logistics'),'observations',jsonb_build_array('practice'),'went_well','QA feedback');
 created:=public.ehe_correct_volunteer_visit(actor,mail,data);sid:=(created->>'service_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.ehe_service WHERE id=sid AND booking_id=bid AND needs_support AND went_well='QA feedback' AND duties=ARRAY['logistics']) THEN RAISE EXCEPTION 'Manual booked entry details not saved';END IF;
 data:=data-'manual_booking'-'booking_id'||jsonb_build_object('service_id',sid,'version',1,'request_id',gen_random_uuid(),'name','FICTIONAL Corrected Name','email','qa-corrected@example.invalid','event_id',other_evt,'role','teaching','support_details','Updated support','out_local',day::text||'T16:00','improvements','Updated feedback');
 PERFORM public.ehe_correct_volunteer_visit(actor,mail,data);
 IF NOT EXISTS(SELECT 1 FROM public.ehe_service WHERE id=sid AND booking_id=bid AND visit_name='FICTIONAL Corrected Name' AND visit_email='qa-corrected@example.invalid' AND visit_event_id=other_evt AND visit_role='teaching' AND support_details='Updated support' AND improvements='Updated feedback' AND checked_out_at-checked_in_at=interval '3 hours' AND version=2) THEN RAISE EXCEPTION 'Full admin edit failed';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ehe_bookings WHERE id=bid AND person_id=pid AND shift_id=sh) OR NOT EXISTS(SELECT 1 FROM public.ehe_people WHERE id=pid AND name='FICTIONAL BOOKING QA') THEN RAISE EXCEPTION 'Original booking/profile changed';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ehe_audit WHERE target=sid::text AND action='volunteer_visit_before_correction' AND details->'previous'->>'went_well'='QA feedback') THEN RAISE EXCEPTION 'Audit history missing';END IF;
 rejected:=false;BEGIN PERFORM public.ehe_correct_volunteer_visit(null,null,data||jsonb_build_object('request_id',gen_random_uuid()));EXCEPTION WHEN OTHERS THEN IF SQLERRM='FORBIDDEN' THEN rejected:=true;ELSE RAISE;END IF;END;IF NOT rejected THEN RAISE EXCEPTION 'Unauthorized edit accepted';END IF;
 rejected:=false;BEGIN PERFORM public.ehe_correct_volunteer_visit(actor,mail,data||jsonb_build_object('request_id',gen_random_uuid(),'version',2,'duties',jsonb_build_array('not-a-duty')));EXCEPTION WHEN OTHERS THEN IF SQLERRM='INVALID_INPUT' THEN rejected:=true;ELSE RAISE;END IF;END;IF NOT rejected THEN RAISE EXCEPTION 'Invalid duties accepted';END IF;
END $qa$;

ROLLBACK;
