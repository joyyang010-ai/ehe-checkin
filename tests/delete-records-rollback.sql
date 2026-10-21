DO $test$
DECLARE actor uuid; mail text; d jsonb; result jsonb; sid uuid; sh text:='QA-DELETE-'||gen_random_uuid(); evt text; ver timestamptz; denied boolean; snap jsonb; original_in timestamptz; pid text; bid uuid;
BEGIN
 SELECT u.id,st.email INTO actor,mail FROM public.ehe_staff st JOIN auth.users u ON lower(u.email)=st.email WHERE st.active AND st.access_role='admin' AND u.email_confirmed_at IS NOT NULL LIMIT 1;
 SELECT id INTO evt FROM public.ehe_events LIMIT 1;
 INSERT INTO public.ehe_shifts(id,event_id,duty,starts_at,ends_at,capacity,published) VALUES(sh,evt,'staff',now()-interval '3 hours',now()-interval '1 hour',1,false) RETURNING updated_at INTO ver;
 d:=jsonb_build_object('request_id',gen_random_uuid(),'operation','delete','target_type','shift','id',sh,'version',ver,'reason','Fictional rollback QA');
 denied:=false;BEGIN PERFORM public.ehe_correct_volunteer_visit(NULL,NULL,d);EXCEPTION WHEN OTHERS THEN IF SQLERRM='FORBIDDEN' THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'Anonymous deletion accepted';END IF;
 result:=public.ehe_correct_volunteer_visit(actor,mail,d);
 IF public.ehe_correct_volunteer_visit(actor,mail,d)<>result THEN RAISE EXCEPTION 'Deletion retry changed result';END IF;
 SELECT updated_at INTO ver FROM public.ehe_shifts WHERE id=sh AND deleted_at IS NOT NULL AND NOT published;IF NOT FOUND THEN RAISE EXCEPTION 'Shift not deleted';END IF;
 PERFORM public.ehe_correct_volunteer_visit(actor,mail,d||jsonb_build_object('operation','restore','version',ver,'request_id',gen_random_uuid()));
 IF NOT EXISTS(SELECT 1 FROM public.ehe_shifts WHERE id=sh AND deleted_at IS NULL AND NOT published) THEN RAISE EXCEPTION 'Shift not restored safely';END IF;
 d:=jsonb_build_object('request_id',gen_random_uuid(),'manual_new',true,'name','FICTIONAL DELETE QA','email','qa-delete@example.invalid','role','staff','event_id','','in_local',to_char(now() AT TIME ZONE 'America/New_York'-interval '2 hours','YYYY-MM-DD"T"HH24:MI:SS'),'out_local',to_char(now() AT TIME ZONE 'America/New_York'-interval '1 hour','YYYY-MM-DD"T"HH24:MI:SS'),'reason','Fictional rollback QA');
 result:=public.ehe_correct_volunteer_visit(actor,mail,d);sid:=(result->>'service_id')::uuid;
 SELECT checked_in_at INTO original_in FROM public.ehe_service WHERE id=sid AND visit_role='staff';IF NOT FOUND THEN RAISE EXCEPTION 'Staff role not saved';END IF;
 d:=jsonb_build_object('request_id',gen_random_uuid(),'operation','delete','target_type','service','id',sid,'version',1,'reason','Fictional rollback QA');
 PERFORM public.ehe_correct_volunteer_visit(actor,mail,d);
 snap:=public.ehe_staff_command(actor,mail,'snapshot','{}');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'service') r WHERE r->>'id'=sid::text) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snap->'deleted_service') r WHERE r->>'id'=sid::text) THEN RAISE EXCEPTION 'Deleted entry still in active snapshot';END IF;
 denied:=false;BEGIN PERFORM public.ehe_correct_volunteer_visit(actor,mail,d||jsonb_build_object('request_id',gen_random_uuid()));EXCEPTION WHEN OTHERS THEN IF SQLERRM='CONFLICT_REFRESH' THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'Stale deletion accepted';END IF;
 PERFORM public.ehe_correct_volunteer_visit(actor,mail,d||jsonb_build_object('operation','restore','version',2,'request_id',gen_random_uuid()));
 IF NOT EXISTS(SELECT 1 FROM public.ehe_service WHERE id=sid AND deleted_at IS NULL AND checked_in_at=original_in AND version=3) THEN RAISE EXCEPTION 'Restoration lost original time';END IF;
 IF (SELECT count(*) FROM public.ehe_audit WHERE target=sid::text AND action IN ('volunteer_visit_deleted','volunteer_visit_restored'))<>2 THEN RAISE EXCEPTION 'Audit history missing';END IF;
 -- Public check-in accepts Staff; a deleted entry must not block a new visit.
 result:=public.ehe_record_volunteer_visit(gen_random_uuid(),'in','FICTIONAL PUBLIC DELETE QA','qa-public-delete@example.invalid',NULL,NULL,'staff','{}');sid:=(result->>'service_id')::uuid;
 PERFORM public.ehe_correct_volunteer_visit(actor,mail,jsonb_build_object('request_id',gen_random_uuid(),'operation','delete','target_type','service','id',sid,'version',1,'reason','Fictional rollback QA'));
 result:=public.ehe_record_volunteer_visit(gen_random_uuid(),'in','FICTIONAL PUBLIC DELETE QA','qa-public-delete@example.invalid',NULL,NULL,'staff','{}');
 IF result->>'service_id'=sid::text OR result->>'status'<>'checked_in' THEN RAISE EXCEPTION 'Deleted visit blocks new check-in';END IF;
-- A booked record can be deleted and restored without losing its booking link.
 INSERT INTO public.ehe_people(kind,name,email) VALUES('volunteer','FICTIONAL BOOKED DELETE QA','qa-booked-delete@example.invalid') RETURNING id INTO pid;
 INSERT INTO public.ehe_bookings(person_id,shift_id,status) VALUES(pid,sh,'confirmed') RETURNING id INTO bid;
 INSERT INTO public.ehe_service(booking_id,checked_in_at,checked_out_at) VALUES(bid,now()-interval '2 hours',now()-interval '1 hour') RETURNING id INTO sid;
 d:=jsonb_build_object('request_id',gen_random_uuid(),'operation','delete','target_type','service','id',sid,'version',1,'reason','Fictional booked rollback QA');
 PERFORM public.ehe_correct_volunteer_visit(actor,mail,d);
 IF NOT EXISTS(SELECT 1 FROM public.ehe_service WHERE id=sid AND booking_id IS NULL AND deleted_booking_id=bid AND visit_name='FICTIONAL BOOKED DELETE QA') THEN RAISE EXCEPTION 'Booking history lost';END IF;
 PERFORM public.ehe_correct_volunteer_visit(actor,mail,d||jsonb_build_object('request_id',gen_random_uuid(),'operation','restore','version',2));
 IF NOT EXISTS(SELECT 1 FROM public.ehe_service WHERE id=sid AND booking_id=bid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Booking link not restored';END IF;
END $test$;
