-- Applied to the existing project as ux_optional_volunteer_event on 2026-10-28.
-- No real profiles, attendance, bookings or roles are edited by this patch.
-- This journal is not an instruction to reapply the already-applied migration.
DO $patch$
DECLARE src text; old_guard text := 'IF p_kind=''in'' AND evt IS NULL AND sh IS NULL THEN RAISE EXCEPTION ''EVENT_REQUIRED''; END IF;';
BEGIN
 SELECT pg_get_functiondef('public.ehe_record_volunteer_visit(uuid,text,text,text,text,text,text,jsonb)'::regprocedure) INTO src;
 IF strpos(src,old_guard)=0 OR strpos(src,'IF p.id IS NOT NULL THEN')=0 THEN RAISE EXCEPTION 'SOURCE_CHANGED_ABORT'; END IF;
 IF has_function_privilege('anon','public.ehe_record_volunteer_visit(uuid,text,text,text,text,text,text,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.ehe_record_volunteer_visit(uuid,text,text,text,text,text,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'UNSAFE_RPC_GRANTS'; END IF;
 src:=replace(src,old_guard,'IF p_data ? ''unassigned_event'' AND jsonb_typeof(p_data->''unassigned_event'')<>''boolean'' THEN RAISE EXCEPTION ''INVALID_INPUT''; END IF;');
 src:=replace(src,'IF p.id IS NOT NULL THEN','IF p.id IS NOT NULL AND NOT coalesce((p_data->>''unassigned_event'')::boolean,false) THEN');
 EXECUTE src;
END $patch$;
