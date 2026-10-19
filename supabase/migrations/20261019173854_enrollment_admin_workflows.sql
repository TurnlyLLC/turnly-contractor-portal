alter table public.recruiting_applications add column resume_path text, add column resume_name text;
alter table public.ba_members add column onboarding_completed_at timestamptz;
create table public.recruiting_delivery (
 application_id uuid primary key references public.recruiting_applications(id), payload jsonb, sent_at timestamptz,
 processing_at timestamptz, attempts integer not null default 0, last_error text, created_at timestamptz not null default now()
);
create table public.ba_onboarding (
 user_id uuid primary key references public.ba_members(user_id), agreement_version text, agreement_text text, signature_name text, signed_at timestamptz,
 w9_path text, w9_received_at timestamptz, marketing_ack boolean not null default false, insurance_ack boolean not null default false,
 payout_ack boolean not null default false, completed_at timestamptz, updated_at timestamptz not null default now()
);
alter table public.recruiting_delivery enable row level security;
alter table public.ba_onboarding enable row level security;
revoke all on public.recruiting_delivery, public.ba_onboarding from public,anon,authenticated;
grant select,insert,update on public.recruiting_delivery,public.ba_onboarding to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('recruiting-private','recruiting-private',false,1048576,array['application/pdf']) on conflict(id) do nothing;
create function public.finish_ba_onboarding(p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from public.ba_members where user_id=p_user and enabled for update;
 if not found then raise exception 'Account inactive'; end if;
 perform 1 from public.ba_onboarding where user_id=p_user and signed_at is not null and w9_path is not null and marketing_ack and insurance_ack and payout_ack for update;
 if not found then raise exception 'Complete all onboarding steps'; end if;
 update public.ba_onboarding set completed_at=coalesce(completed_at,now()),updated_at=now() where user_id=p_user;
 update public.ba_members set onboarding_completed_at=coalesce(onboarding_completed_at,now()) where user_id=p_user;
end $$;
revoke all on function public.finish_ba_onboarding(uuid) from public,anon,authenticated;
grant execute on function public.finish_ba_onboarding(uuid) to service_role;
create or replace function public.register_ba_lead(p_code text,p_name text,p_email text,p_phone text,p_consent text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare m ba_members; l ba_leads;
begin
 perform pg_advisory_xact_lock(610081200);
 select * into m from ba_members where code=p_code and enabled and onboarding_completed_at is not null;
 if not found then raise exception 'Ambassador link is inactive'; end if;
 if length(trim(p_name))<1 or p_email not like '%@%' or length(p_phone)<10 or coalesce(p_consent,'')='' then raise exception 'Contact details and consent are required'; end if;
 select * into l from ba_leads where email=lower(trim(p_email)) or phone=p_phone order by created_at,id limit 1;
 if found then return l.id; end if;
 insert into ba_leads(member_id,name,email,phone,consent_version)
 values(m.user_id,p_name,lower(trim(p_email)),p_phone,p_consent) returning * into l;
 insert into ba_events(lead_id,event) values(l.id,'lead_registered');
 return l.id;
end $$;


create function public.queue_recruiting_email() returns trigger language plpgsql security invoker set search_path='' as $$ begin insert into public.recruiting_delivery(application_id) values(new.id);return new;end $$;
revoke all on function public.queue_recruiting_email() from public,anon,authenticated;
create trigger recruiting_email_queued after insert on public.recruiting_applications for each row execute function public.queue_recruiting_email();
