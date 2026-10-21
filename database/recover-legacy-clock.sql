-- Restore original server-received clock entries without inventing times or bookings.
CREATE OR REPLACE FUNCTION pg_temp.recover_legacy_clock() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE sub public.ehe_submissions; sh public.ehe_shifts; entry public.ehe_service; nm text; em text; nk text; pid text; match_count integer; created_count integer:=0; linked_count integer:=0; checkout_count integer:=0; orphan_count integer:=0; data jsonb; result jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(612614060);
 FOR sub IN SELECT * FROM public.ehe_submissions WHERE kind IN ('in','out') AND review_status<>'dismissed' ORDER BY created_at,request_id LOOP
  IF EXISTS(SELECT 1 FROM public.ehe_volunteer_visit_requests WHERE request_id=sub.request_id) THEN CONTINUE;END IF;
  nm:=btrim(normalize(coalesce(sub.payload->>'name',''),NFKC));em:=lower(btrim(coalesce(sub.payload->>'email','')));nk:=lower(regexp_replace(nm,'[[:space:]]+',' ','g'));data:=coalesce(sub.payload->'data','{}');
  IF nm='' OR em !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN orphan_count:=orphan_count+1;CONTINUE;END IF;
  SELECT * INTO sh FROM public.ehe_shifts WHERE id=sub.shift_id;
  entry:=NULL;pid:=NULL;
  IF sub.kind='in' THEN
   -- Existing, including manually corrected, entries take precedence over recovery.
   SELECT count(*) INTO match_count FROM public.ehe_service v LEFT JOIN public.ehe_bookings b ON b.id=v.booking_id LEFT JOIN public.ehe_shifts s ON s.id=b.shift_id LEFT JOIN public.ehe_people p ON p.id=b.person_id
    WHERE lower(btrim(coalesce(v.visit_email,p.email)))=em AND lower(regexp_replace(normalize(btrim(coalesce(v.visit_name,p.name)),NFKC),'[[:space:]]+',' ','g'))=nk
    AND (v.checked_in_at AT TIME ZONE 'America/New_York')::date=(sub.created_at AT TIME ZONE 'America/New_York')::date AND coalesce(v.visit_event_id,s.event_id) IS NOT DISTINCT FROM sh.event_id
    AND (v.checked_in_at=sub.created_at OR v.source='staff_corrected');
   IF match_count=1 THEN
    SELECT v.* INTO entry FROM public.ehe_service v LEFT JOIN public.ehe_bookings b ON b.id=v.booking_id LEFT JOIN public.ehe_shifts s ON s.id=b.shift_id LEFT JOIN public.ehe_people p ON p.id=b.person_id
     WHERE lower(btrim(coalesce(v.visit_email,p.email)))=em AND lower(regexp_replace(normalize(btrim(coalesce(v.visit_name,p.name)),NFKC),'[[:space:]]+',' ','g'))=nk
     AND (v.checked_in_at AT TIME ZONE 'America/New_York')::date=(sub.created_at AT TIME ZONE 'America/New_York')::date AND coalesce(v.visit_event_id,s.event_id) IS NOT DISTINCT FROM sh.event_id
     AND (v.checked_in_at=sub.created_at OR v.source='staff_corrected');
    linked_count:=linked_count+1;
   ELSIF match_count>1 THEN orphan_count:=orphan_count+1;CONTINUE;
   ELSE
    SELECT count(*) INTO match_count FROM public.ehe_people WHERE kind='volunteer' AND lower(btrim(email))=em AND lower(regexp_replace(normalize(btrim(name),NFKC),'[[:space:]]+',' ','g'))=nk;
    IF match_count=1 THEN SELECT id INTO pid FROM public.ehe_people WHERE kind='volunteer' AND lower(btrim(email))=em AND lower(regexp_replace(normalize(btrim(name),NFKC),'[[:space:]]+',' ','g'))=nk;END IF;
    INSERT INTO public.ehe_service(checked_in_at,needs_support,support_details,visit_person_id,visit_event_id,visit_shift_id,visit_name,visit_email,visit_name_key,visit_date,visit_role,visit_identity,visit_origin,source)
     VALUES(sub.created_at,coalesce((data->>'needs_support')::boolean,false),coalesce(data->>'support_details',''),pid,sh.event_id,sh.id,nm,em,nk,(sub.created_at AT TIME ZONE 'America/New_York')::date,sh.duty,CASE WHEN pid IS NULL THEN 'unlinked' ELSE 'matched' END,'walk_in','self_reported') RETURNING * INTO entry;
    created_count:=created_count+1;
   END IF;
  ELSE
   SELECT v.* INTO entry FROM public.ehe_service v LEFT JOIN public.ehe_bookings b ON b.id=v.booking_id LEFT JOIN public.ehe_shifts s ON s.id=b.shift_id LEFT JOIN public.ehe_people p ON p.id=b.person_id
    WHERE lower(btrim(coalesce(v.visit_email,p.email)))=em AND lower(regexp_replace(normalize(btrim(coalesce(v.visit_name,p.name)),NFKC),'[[:space:]]+',' ','g'))=nk
    AND coalesce(v.visit_event_id,s.event_id) IS NOT DISTINCT FROM sh.event_id AND v.checked_in_at<=sub.created_at
    AND (v.checked_in_at AT TIME ZONE 'America/New_York')::date=(sub.created_at AT TIME ZONE 'America/New_York')::date
    AND (v.checked_out_at IS NULL OR v.checked_out_at=sub.created_at OR v.source='staff_corrected')
    ORDER BY v.checked_in_at DESC LIMIT 1 FOR UPDATE OF v;
   IF entry.id IS NULL THEN orphan_count:=orphan_count+1;CONTINUE;END IF;
   IF entry.checked_out_at IS NULL AND entry.source<>'staff_corrected' THEN
    UPDATE public.ehe_service SET checked_out_at=sub.created_at,duties=ARRAY(SELECT jsonb_array_elements_text(coalesce(data->'duties','[]'))),observations=ARRAY(SELECT jsonb_array_elements_text(coalesce(data->'observations','[]'))),duty_other=coalesce(data->>'duty_other',''),observation_other=coalesce(data->>'observation_other',''),specific_observations=coalesce(data->>'specific_observations',''),went_well=coalesce(data->>'went_well',''),improvements=coalesce(data->>'improvements',''),version=version+1 WHERE id=entry.id RETURNING * INTO entry;
    checkout_count:=checkout_count+1;
   END IF;
  END IF;
  result:=jsonb_build_object('recorded',true,'requires_review',false,'status',CASE WHEN sub.kind='in' THEN 'checked_in' ELSE 'checked_out' END,'service_id',entry.id,'checked_in_at',entry.checked_in_at,'checked_out_at',entry.checked_out_at,'recovered_from_legacy',true);
  INSERT INTO public.ehe_volunteer_visit_requests(request_id,kind,payload,outcome,service_id) VALUES(sub.request_id,sub.kind,sub.payload,result,entry.id);
  INSERT INTO public.ehe_audit(action,target,details) VALUES('legacy_clock_recovered',entry.id::text,jsonb_build_object('original_submission_id',sub.request_id,'kind',sub.kind,'original_received_at',sub.created_at,'previous_review_status',sub.review_status));
  UPDATE public.ehe_submissions SET review_status=CASE WHEN review_status='none' THEN 'none' ELSE 'resolved' END,review_note=concat_ws(E'\n',nullif(review_note,''),'Recovered to attendance using the original server timestamp; no approval required.') WHERE request_id=sub.request_id;
 END LOOP;
 RETURN jsonb_build_object('created_entries',created_count,'linked_existing',linked_count,'recovered_checkouts',checkout_count,'unmatched_submissions',orphan_count);
END $$;
SELECT pg_temp.recover_legacy_clock();
