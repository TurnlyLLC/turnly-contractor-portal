begin;
do $test$
declare a uuid; u uuid; p uuid; p2 uuid; l uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); g jsonb; n integer;
begin
 select id into a from public.profiles where role::text='admin' and status='active' limit 1;
 select id into u from public.profiles where role::text in ('sales','sales_team') and status='active' limit 1;
 if u is null then raise exception 'Test needs sales profile';end if;
 p:=public.crm_set_flat_plan(a,u,12345,1,2,'After administrator approval.');
 update public.crm_pay_plans set effective_at=now()-interval '1 minute' where id=p;
 insert into public.sales_leads(id,property_name,name,sales_owner_id,business_segment,do_not_contact) values(l,'Rollback test','Rollback test',u,'residential',false),(d,'Rollback DNC','Rollback DNC',u,'residential',true);
 insert into public.crm_voice_calls(user_id,lead_id,session_id,phone,status,call_sid,dialed_at) values(u,l,gen_random_uuid(),'+12025550100','no-answer','TEST-'||gen_random_uuid(),now()-interval '30 seconds'),(u,d,gen_random_uuid(),'+12025550100','no-answer','TEST-'||gen_random_uuid(),now()-interval '30 seconds');
 insert into public.crm_sales_messages(request_id,user_id,lead_id,channel,recipient,consent_at,consent_note,body,status,provider_id,created_at)
 values(gen_random_uuid(),u,l,'email','test@example.com',now(),'test','test','failed','TEST-failed',now()-interval '20 seconds');
 g:=public.crm_flat_progress(p);
 select (x->>'attempts')::integer into n from jsonb_array_elements(g->'leads') x where x->>'lead_id'=l::text;
 if n<>1 or (g->>'qualified_count')::integer<>0 then raise exception 'Failed sends counted or minimum ignored';end if;
 begin perform public.crm_review_flat_pay(a,p,'approve',12345);raise exception 'Unexpected approval';exception when raise_exception then if sqlerrm='Unexpected approval' then raise;end if;end;
 insert into public.crm_sales_messages(request_id,user_id,lead_id,channel,recipient,consent_at,consent_note,body,status,provider_id,created_at)
 values(gen_random_uuid(),u,l,'email','test@example.com',now(),'test','test','accepted','TEST-good',now()-interval '20 seconds'),(gen_random_uuid(),u,l,'email','test@example.com',now(),'test','test','accepted','TEST-good',now()-interval '19 seconds'),
 (gen_random_uuid(),u,d,'email','test@example.com',now(),'test','test','accepted','TEST-DNC',now()-interval '20 seconds');
 g:=public.crm_flat_progress(p);
 select (x->>'attempts')::integer into n from jsonb_array_elements(g->'leads') x where x->>'lead_id'=l::text;
 if n<>2 or (g->>'qualified_count')::integer<>1 then raise exception 'Duplicate or DNC incorrectly counted';end if;
 begin perform public.crm_review_flat_pay(u,p,'approve',12345);raise exception 'Unexpected nonadmin approval';exception when raise_exception then if sqlerrm='Unexpected nonadmin approval' then raise;end if;end;
 perform public.crm_review_flat_pay(a,p,'approve',12345);
 perform public.crm_review_flat_pay(a,p,'approve',12345);
 if (select count(*) from public.crm_flat_payments where plan_id=p)<>1 then raise exception 'Duplicate payment';end if;
 perform public.crm_review_flat_pay(a,p,'record_paid',12345,'TEST-payment');
 if not exists(select 1 from public.crm_flat_payments where plan_id=p and paid_at is not null and amount_cents=12345) then raise exception 'Payment not recorded';end if;
 p2:=public.crm_set_flat_plan(a,u,10000,1,1,'After administrator approval.');
 update public.crm_pay_plans set effective_at=now()-interval '10 seconds' where id=p2;
 insert into public.crm_sales_messages(request_id,user_id,lead_id,channel,recipient,consent_at,consent_note,body,status,provider_id,created_at)
 values(gen_random_uuid(),u,l,'email','test@example.com',now(),'test','test','accepted','TEST-next',now()-interval '5 seconds');
 g:=public.crm_flat_progress(p2);
 if (g->>'qualified_count')::integer<>0 then raise exception 'Previously credited lead counted twice';end if;
 if has_function_privilege('authenticated','public.crm_review_flat_pay(uuid,uuid,text,integer,text)','EXECUTE') or has_table_privilege('authenticated','public.crm_flat_payments','SELECT') then raise exception 'Unsafe grants';end if;
end $test$;
rollback;
select 'PASS: thresholds, failed sends, duplicate receipts, DNC exclusions, admin-only review, idempotence, payment and prior-lead exclusions; all test changes rolled back' as result;
