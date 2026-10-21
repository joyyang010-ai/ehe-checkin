BEGIN;

DO $test$
DECLARE actor uuid; mail text; data jsonb; result jsonb; again jsonb; sid uuid; base timestamp; denied boolean;
BEGIN
 SELECT u.id,st.email INTO actor,mail FROM public.ehe_staff st JOIN auth.users u ON lower(u.email)=st.email WHERE st.active AND st.access_role='admin' AND u.email_confirmed_at IS NOT NULL LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'QA requires an existing verified admin';END IF;
 base:=((now() AT TIME ZONE 'America/New_York')::date-2)+time '13:00';
 data:=jsonb_build_object('manual_new',true,'request_id',gen_random_uuid(),'name','FICTIONAL ADMIN TIMES QA','email','qa-admin-times@example.invalid','in_local',to_char(base,'YYYY-MM-DD"T"HH24:MI:SS'),'out_local',to_char(base+interval '2 hours','YYYY-MM-DD"T"HH24:MI:SS'),'reason','','event_id','','role','');
 denied:=false;BEGIN PERFORM public.ehe_correct_volunteer_visit(null,null,data);EXCEPTION WHEN OTHERS THEN IF SQLERRM='FORBIDDEN' THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'Unauthorized write accepted';END IF;
 result:=public.ehe_correct_volunteer_visit(actor,mail,data);sid:=(result->>'service_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.ehe_service WHERE id=sid AND source='staff_corrected' AND checked_out_at-checked_in_at=interval '2 hours') THEN RAISE EXCEPTION 'Manual duration mismatch';END IF;
 again:=public.ehe_correct_volunteer_visit(actor,mail,data);IF again<>result THEN RAISE EXCEPTION 'Retry not idempotent';END IF;
 denied:=false;BEGIN PERFORM public.ehe_correct_volunteer_visit(actor,mail,data||jsonb_build_object('request_id',gen_random_uuid()));EXCEPTION WHEN OTHERS THEN IF SQLERRM='CONFLICT_REFRESH' THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'Duplicate visit accepted';END IF;

 denied:=false;BEGIN PERFORM public.ehe_correct_volunteer_visit(actor,mail,data||jsonb_build_object('request_id',gen_random_uuid(),'out_local',to_char(base-interval '1 hour','YYYY-MM-DD"T"HH24:MI:SS')));EXCEPTION WHEN OTHERS THEN IF SQLERRM='INVALID_TIME' THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'Reversed times accepted';END IF;
 data:=data||jsonb_build_object('manual_new',false,'service_id',sid,'version',1,'request_id',gen_random_uuid(),'out_local',to_char(base+interval '3 hours','YYYY-MM-DD"T"HH24:MI:SS'));
 PERFORM public.ehe_correct_volunteer_visit(actor,mail,data);
 IF NOT EXISTS(SELECT 1 FROM public.ehe_service WHERE id=sid AND version=2 AND checked_out_at-checked_in_at=interval '3 hours') THEN RAISE EXCEPTION 'Correction mismatch';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ehe_audit WHERE target=sid::text AND action='volunteer_visit_before_correction' AND details->'previous'->>'checked_out_at' IS NOT NULL) THEN RAISE EXCEPTION 'Original times not audited';END IF;
 denied:=false;BEGIN PERFORM public.ehe_correct_volunteer_visit(actor,mail,data||jsonb_build_object('request_id',gen_random_uuid()));EXCEPTION WHEN OTHERS THEN IF SQLERRM='CONFLICT_REFRESH' THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'Stale version accepted';END IF;
END $test$;

ROLLBACK;
