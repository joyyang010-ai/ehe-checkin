DO $test$
DECLARE actor uuid; mail text; d jsonb; a jsonb; b jsonb; sid uuid; sid2 uuid; base timestamp; result jsonb; denied boolean;
BEGIN
 SELECT u.id,st.email INTO actor,mail FROM public.ehe_staff st JOIN auth.users u ON lower(u.email)=st.email WHERE st.active AND st.access_role='admin' AND u.email_confirmed_at IS NOT NULL LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'QA needs verified admin'; END IF;
 base:=((now() AT TIME ZONE 'America/New_York')::date-2)+time '13:00';
 d:=jsonb_build_object('request_id',gen_random_uuid(),'manual_new',true,'edit_details',true,'name','FICTIONAL BULK A','email','','event_id','','role','staff','in_local',to_char(base,'YYYY-MM-DD"T"HH24:MI:SS'),'out_local','','reason','','needs_support',false,'duties','[]'::jsonb,'observations','[]'::jsonb);
 result:=public.ehe_correct_volunteer_visit(actor,mail,d);sid:=(result->>'service_id')::uuid;
 result:=public.ehe_correct_volunteer_visit(actor,mail,d||jsonb_build_object('request_id',gen_random_uuid(),'name','FICTIONAL BULK B'));sid2:=(result->>'service_id')::uuid;
 a:=(d-'manual_new')||jsonb_build_object('request_id',gen_random_uuid(),'service_id',sid,'version',1,'out_local',to_char(base+interval '2 hours','YYYY-MM-DD"T"HH24:MI:SS'));
 b:=(d-'manual_new')||jsonb_build_object('request_id',gen_random_uuid(),'service_id',sid2,'version',1,'name','FICTIONAL BULK B','out_local',to_char(base+interval '2 hours','YYYY-MM-DD"T"HH24:MI:SS'));
 denied:=false;BEGIN PERFORM public.ehe_bulk_correct_volunteer_visits(actor,mail,jsonb_build_array(a,b||'{"version":999}'::jsonb));EXCEPTION WHEN OTHERS THEN IF SQLERRM='CONFLICT_REFRESH' THEN denied:=true;ELSE RAISE;END IF;END;
 IF NOT denied OR EXISTS(SELECT 1 FROM public.ehe_service WHERE id IN(sid,sid2) AND version<>1) THEN RAISE EXCEPTION 'Batch did not roll back';END IF;
 result:=public.ehe_bulk_correct_volunteer_visits(actor,mail,jsonb_build_array(a,b));
 IF (result->>'ok')::boolean IS NOT TRUE OR (SELECT count(*) FROM public.ehe_service WHERE id IN(sid,sid2) AND version=2 AND checked_out_at-checked_in_at=interval '2 hours')<>2 THEN RAISE EXCEPTION 'Bulk save failed';END IF;
 PERFORM public.ehe_bulk_correct_volunteer_visits(actor,mail,jsonb_build_array(a,b));
 IF EXISTS(SELECT 1 FROM public.ehe_service WHERE id IN(sid,sid2) AND version<>2) THEN RAISE EXCEPTION 'Retry duplicated writes';END IF;
 PERFORM public.ehe_bulk_correct_volunteer_visits(actor,mail,jsonb_build_array(a||jsonb_build_object('request_id',gen_random_uuid(),'version',2,'out_local',''),b||jsonb_build_object('request_id',gen_random_uuid(),'version',2,'out_local','')));
 IF EXISTS(SELECT 1 FROM public.ehe_service WHERE id IN(sid,sid2) AND (version<>3 OR checked_out_at IS NOT NULL)) THEN RAISE EXCEPTION 'Bulk undo failed';END IF;
 denied:=false;BEGIN PERFORM public.ehe_bulk_correct_volunteer_visits(NULL,NULL,jsonb_build_array(a,b));EXCEPTION WHEN OTHERS THEN IF SQLERRM='FORBIDDEN' THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'Unauthenticated bulk accepted';END IF;
 denied:=false;BEGIN PERFORM public.ehe_record_volunteer_visit(gen_random_uuid(),'in','FICTIONAL NO EVENT','no-event@example.invalid');EXCEPTION WHEN OTHERS THEN IF SQLERRM='EVENT_REQUIRED' THEN denied:=true;ELSE RAISE;END IF;END;IF NOT denied THEN RAISE EXCEPTION 'Missing event accepted';END IF;
 IF has_function_privilege('anon','public.ehe_bulk_correct_volunteer_visits(uuid,text,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.ehe_bulk_correct_volunteer_visits(uuid,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Bulk RPC directly exposed';END IF;
END $test$;
SELECT 'PASS atomic bulk save, stale rollback, idempotent retry, undo, auth boundary, event requirement' verification;
