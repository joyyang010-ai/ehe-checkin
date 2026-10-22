-- Each batch is one transaction; existing correction guards, audit and request deduplication apply.
CREATE OR REPLACE FUNCTION public.ehe_bulk_correct_volunteer_visits(p_actor uuid,p_email text,p_entries jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE item jsonb; results jsonb:='[]'; result jsonb;
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.ehe_staff st JOIN auth.users u ON lower(u.email)=st.email WHERE u.id=p_actor AND st.email=p_email AND st.active AND st.access_role='admin' AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_entries IS NULL OR jsonb_typeof(p_entries)<>'array' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF jsonb_array_length(p_entries) NOT BETWEEN 1 AND 100 OR length(p_entries::text)>500000 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF (SELECT count(DISTINCT value->>'service_id') FROM jsonb_array_elements(p_entries))<>jsonb_array_length(p_entries) THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_entries) ORDER BY value->>'service_id' LOOP
  IF jsonb_typeof(item)<>'object' OR coalesce(item->>'service_id','')='' OR item ? 'operation' OR item ? 'manual_new' OR item ? 'manual_booking' OR coalesce(item->>'edit_details','')<>'true' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  result:=public.ehe_correct_volunteer_visit(p_actor,p_email,item);
  IF coalesce((result->>'ok')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  results:=results||jsonb_build_array(result||jsonb_build_object('version',(item->>'version')::integer+1));
 END LOOP;
 RETURN jsonb_build_object('ok',true,'entries',results);
END $$;
REVOKE ALL ON FUNCTION public.ehe_bulk_correct_volunteer_visits(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ehe_bulk_correct_volunteer_visits(uuid,text,jsonb) TO service_role;
