BEGIN;
DO $test$
DECLARE actor uuid; mail text; d jsonb; result jsonb; sid uuid; denied boolean; base timestamp; profile_count bigint;
BEGIN
 SELECT u.id,st.email INTO actor,mail FROM public.ehe_staff st JOIN auth.users u ON lower(u.email)=st.email WHERE st.active AND st.access_role='admin' AND u.email_confirmed_at IS NOT NULL LIMIT 1;
 SELECT count(*) INTO profile_count FROM public.ehe_people;
 base:=((now() AT TIME ZONE 'America/New_York')::date-2)+time '13:00';
 d:=jsonb_build_object('request_id',gen_random_uuid(),'manual_new',true,'edit_details',true,'name','FICTIONAL SENIOR VOLUNTEER QA','email','','event_id','','role','staff','in_local',to_char(base,'YYYY-MM-DD"T"HH24:MI:SS'),'out_local','','reason','','needs_support',false,'duties','[]'::jsonb,'observations','[]'::jsonb);
 result:=public.ehe_correct_volunteer_visit(actor,mail,d);sid:=(result->>'service_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.ehe_service WHERE id=sid AND visit_email='' AND visit_name='FICTIONAL SENIOR VOLUNTEER QA' AND visit_person_id IS NULL AND booking_id IS NULL) THEN RAISE EXCEPTION 'Blank email not saved independently';END IF;
 IF (SELECT count(*) FROM public.ehe_people)<>profile_count THEN RAISE EXCEPTION 'Unexpected profile creation';END IF;
 PERFORM public.ehe_correct_volunteer_visit(actor,mail,d||jsonb_build_object('request_id',gen_random_uuid(),'manual_new',false,'service_id',sid,'version',1,'out_local',to_char(base+interval '2 hours','YYYY-MM-DD"T"HH24:MI:SS')));
 IF NOT EXISTS(SELECT 1 FROM public.ehe_service WHERE id=sid AND version=2 AND visit_email='' AND checked_out_at-checked_in_at=interval '2 hours') THEN RAISE EXCEPTION 'Blank-email checkout edit failed';END IF;
 result:=public.ehe_correct_volunteer_visit(actor,mail,jsonb_build_object('request_id',gen_random_uuid(),'operation','delete','target_type','service','id',sid,'version',2,'reason',''));
 PERFORM public.ehe_correct_volunteer_visit(actor,mail,jsonb_build_object('request_id',gen_random_uuid(),'operation','restore','target_type','service','id',sid,'version',(result->>'version')::integer,'reason',''));
 IF NOT EXISTS(SELECT 1 FROM public.ehe_service WHERE id=sid AND deleted_at IS NULL AND visit_email='' AND checked_out_at-checked_in_at=interval '2 hours') THEN RAISE EXCEPTION 'Blank-email restoration failed';END IF;
 denied:=false;BEGIN PERFORM public.ehe_correct_volunteer_visit(actor,mail,d||jsonb_build_object('request_id',gen_random_uuid(),'name','FICTIONAL INVALID EMAIL QA','email','invalid-email'));EXCEPTION WHEN OTHERS THEN IF SQLERRM='INVALID_INPUT' THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'Malformed nonblank email accepted';END IF;
 denied:=false;BEGIN PERFORM public.ehe_correct_volunteer_visit(NULL,NULL,d);EXCEPTION WHEN OTHERS THEN IF SQLERRM='FORBIDDEN' THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'Anonymous admin entry accepted';END IF;
 denied:=false;BEGIN PERFORM public.ehe_record_volunteer_visit(gen_random_uuid(),'in','FICTIONAL PUBLIC EMAIL QA','');EXCEPTION WHEN OTHERS THEN IF SQLERRM='INVALID_INPUT' THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'Public identity requirement weakened';END IF;
END $test$;
SELECT 'PASS admin blank-email add, edit, hours and restore; malformed email and anonymous writes rejected' verification;
ROLLBACK;
