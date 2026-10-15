create function public.create_direct_booking(p_id uuid,p_token text,p_hash text,p_data jsonb,p_status text,p_consent text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare c referral_customers; a referral_agents; prior referral_bookings;
begin
 perform pg_advisory_xact_lock(610081200);
 select * into prior from referral_bookings where id=p_id;
 if found then
   if prior.token_hash<>p_token or prior.request_hash<>p_hash then raise exception 'Booking request changed. Start a new checkout.'; end if;
   return prior.id;
 end if;
 if p_data->>'state' is distinct from 'NC' then raise exception 'Online booking is available only in NC'; end if;
 if not exists(select 1 from referral_customers where email=p_data->>'email' or phone=p_data->>'phone') then
 insert into referral_customers(name,email,phone) values(p_data->>'name',p_data->>'email',p_data->>'phone'); end if;
 select * into c from referral_customers where email=p_data->>'email' or phone=p_data->>'phone' order by created_at,id limit 1;
 select * into a from referral_agents where id=c.agent_id;
 insert into referral_bookings(id,token_hash,request_hash,customer_id,agent_id,agent_name,referral_code,name,email,phone,profile_address,property_address,city,state,zip,beds,baths,sqft,service,frequency,quote,amount_cents,service_date,arrival_start,arrival_end,charge_at,status,notes,visit_details,consent_text,consent_at)
 values(p_id,p_token,p_hash,c.id,a.id,coalesce(a.name,'Turnly Residential'),coalesce(a.referral_code,''),p_data->>'name',p_data->>'email',p_data->>'phone',p_data->>'profile_address',p_data->>'property_address',p_data->>'city',p_data->>'state',p_data->>'zip',(p_data->>'beds')::integer,(p_data->>'baths')::numeric,(p_data->>'sqft')::integer,p_data->>'service',p_data->>'frequency',p_data->'quote',(p_data->>'amount_cents')::integer,(p_data->>'service_date')::date,(p_data->>'arrival_start')::time,(p_data->>'arrival_end')::time,(p_data->>'charge_at')::timestamptz,p_status,p_data->>'notes',coalesce(p_data->'visit_details','{}'::jsonb),p_consent,case when p_consent is not null then now() end);
 return p_id;
end $$;
revoke all on function public.create_direct_booking(uuid,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.create_direct_booking(uuid,text,text,jsonb,text,text) to service_role;

