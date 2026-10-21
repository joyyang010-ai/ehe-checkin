DO $change$
DECLARE proc regprocedure; definition text;
BEGIN
 FOREACH proc IN ARRAY ARRAY['public.ehe_correct_volunteer_visit(uuid,text,jsonb)'::regprocedure,'public.ehe_manage_deleted_record(uuid,jsonb)'::regprocedure] LOOP
  definition:=pg_get_functiondef(proc);
  IF position('length(btrim(coalesce(p_data->>''reason'','''')))<2 OR ' in definition)=0 THEN RAISE EXCEPTION 'Reason validation changed; review function before applying'; END IF;
  EXECUTE replace(definition,'length(btrim(coalesce(p_data->>''reason'','''')))<2 OR ','');
 END LOOP;
END $change$;
DO $change$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.ehe_manage_deleted_record(uuid,jsonb)'::regprocedure);
 IF position('RETURN jsonb_build_object(''ok'',true);' in definition)=0 THEN RAISE EXCEPTION 'Deletion response changed';END IF;
 EXECUTE replace(definition,'RETURN jsonb_build_object(''ok'',true);','RETURN jsonb_build_object(''ok'',true,''version'',CASE WHEN p_data->>''target_type''=''service'' THEN (SELECT version::text FROM public.ehe_service WHERE id=(p_data->>''id'')::uuid) ELSE (SELECT updated_at::text FROM public.ehe_shifts WHERE id=p_data->>''id'') END);');
END $change$;
