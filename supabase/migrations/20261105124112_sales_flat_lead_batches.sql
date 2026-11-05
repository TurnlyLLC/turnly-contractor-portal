alter table public.crm_pay_plans drop constraint crm_pay_plans_mode_check;
alter table public.crm_pay_plans add constraint crm_pay_plans_mode_check check(mode in ('commission','hourly','flat'));
alter table public.crm_pay_plans add column flat_cents integer not null default 0 check(flat_cents between 0 and 100000000), add column lead_target integer not null default 1 check(lead_target between 1 and 10000), add column min_attempts integer not null default 1 check(min_attempts between 1 and 100);

create table public.crm_flat_payments(
 plan_id uuid primary key references public.crm_pay_plans(id), user_id uuid not null references public.profiles(id),
 amount_cents integer not null check(amount_cents>0), leads jsonb not null,
 approved_at timestamptz not null default now(), approved_by uuid not null references public.profiles(id),
 paid_at timestamptz, paid_by uuid references public.profiles(id), reference text
);
alter table public.crm_flat_payments enable row level security;
revoke all on public.crm_flat_payments from public,anon,authenticated;
grant all on public.crm_flat_payments to service_role;
create index crm_flat_payments_user_idx on public.crm_flat_payments(user_id);

create function public.crm_set_flat_plan(p_admin uuid,p_user uuid,p_amount integer,p_target integer,p_attempts integer,p_terms text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
 if p_amount is null or p_amount not between 1 and 100000000 or p_target is null or p_target not between 1 and 10000 or p_attempts is null or p_attempts not between 1 and 100 then raise exception 'Check the flat amount, lead target and minimum attempts';end if;
 result:=public.crm_set_pay_plan_v2(p_admin,p_user,'flat',0,0,30,30,p_terms);
 update public.crm_pay_plans set flat_cents=p_amount,lead_target=p_target,min_attempts=p_attempts where id=result;
 return result;
end $$;

create function public.crm_flat_progress(p_plan uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 with plan as (
 select p.*,coalesce((select min(q.effective_at) from public.crm_pay_plans q where q.user_id=p.user_id and (q.effective_at,q.id)>(p.effective_at,p.id)),now()) as until
 from public.crm_pay_plans p where p.id=p_plan and p.mode='flat'
 ), attempts as (
 select c.lead_id,'call:'||c.call_sid as receipt,coalesce(c.dialed_at,c.created_at) as attempted_at
 from public.crm_voice_calls c join plan p on p.user_id=c.user_id
 where c.call_sid is not null and coalesce(c.dialed_at,c.created_at)>=p.effective_at and coalesce(c.dialed_at,c.created_at)<p.until
 union
 select m.lead_id,m.channel||':'||m.provider_id,m.created_at from public.crm_sales_messages m join plan p on p.user_id=m.user_id
 where m.provider_id is not null and m.status in ('accepted','sent','delivered','read') and m.created_at>=p.effective_at and m.created_at<p.until
 ), counts as (
 select lead_id,count(distinct receipt)::integer as attempts,max(attempted_at) as last_attempt_at from attempts group by lead_id
 ), leads as (
 select l.id as lead_id,coalesce(nullif(l.contact_name,''),nullif(l.name,''),nullif(l.company_name,''),'Lead') as name,
 coalesce(c.attempts,0) as attempts,c.last_attempt_at,coalesce(l.do_not_contact,false) as excluded,
 exists(select 1 from public.crm_flat_payments f, jsonb_array_elements(f.leads) x where f.user_id=p.user_id and x->>'lead_id'=l.id::text) as previously_credited,
 p.min_attempts
 from plan p join public.sales_leads l on l.sales_owner_id=p.user_id or exists(select 1 from counts c where c.lead_id=l.id)
 left join counts c on c.lead_id=l.id
 ), detail as (
 select *,not excluded and not previously_credited and attempts>=min_attempts as qualified from leads
 ) select jsonb_build_object('plan',to_jsonb(p),'payment',(select to_jsonb(f) from public.crm_flat_payments f where f.plan_id=p.id),
 'qualified_count',(select count(*) from detail where qualified),
 'leads',coalesce((select jsonb_agg(to_jsonb(d) order by qualified desc,attempts desc,name,lead_id) from detail d),'[]'::jsonb)) from plan p;
$$;

create function public.crm_review_flat_pay(p_admin uuid,p_plan uuid,p_action text,p_expected integer,p_reference text default '') returns void
language plpgsql security invoker set search_path='' as $$
declare p public.crm_pay_plans; progress jsonb; selected jsonb; payment public.crm_flat_payments;
begin
 if not exists(select 1 from public.profiles where id=p_admin and role::text='admin' and status='active') then raise exception 'Administrator access required';end if;
 select * into p from public.crm_pay_plans where id=p_plan and mode='flat';
 if not found then raise exception 'Flat-rate batch not found';end if;
 perform pg_advisory_xact_lock(hashtextextended(p.user_id::text,705));
 if p_expected is distinct from p.flat_cents then raise exception 'Amount changed. Refresh and review again';end if;
 select * into payment from public.crm_flat_payments where plan_id=p.id for update;
 if p_action='approve' then
  if found then return;end if;
  -- Hold eligible lead rows stable while checking opt-outs and freezing the review.
  perform 1 from public.sales_leads l where l.sales_owner_id=p.user_id or exists(select 1 from public.crm_voice_calls c where c.user_id=p.user_id and c.lead_id=l.id) or exists(select 1 from public.crm_sales_messages m where m.user_id=p.user_id and m.lead_id=l.id) order by l.id for share;
  progress:=public.crm_flat_progress(p.id);
  select jsonb_agg(x) into selected from (select x from jsonb_array_elements(progress->'leads') x where (x->>'qualified')::boolean order by x->>'last_attempt_at',x->>'lead_id' limit p.lead_target) picked;
  if coalesce(jsonb_array_length(selected),0)<p.lead_target then raise exception 'Not enough qualifying leads. Refresh progress';end if;
  insert into public.crm_flat_payments(plan_id,user_id,amount_cents,leads,approved_by) values(p.id,p.user_id,p.flat_cents,selected,p_admin);
 elsif p_action='record_paid' then
  if not found then raise exception 'Approve this batch first';end if;
  if payment.paid_at is not null then return;end if;
  if length(trim(p_reference)) not between 3 and 240 then raise exception 'Enter a completed payment reference';end if;
  update public.crm_flat_payments set paid_at=now(),paid_by=p_admin,reference=trim(p_reference) where plan_id=p.id;
 else raise exception 'Unknown flat payment action';end if;
 insert into public.crm_access_audit(actor_id,subject_id,action) values(p_admin,p.user_id,'flat_'||p_action||':'||p.id::text);
end $$;

revoke all on function public.crm_set_flat_plan(uuid,uuid,integer,integer,integer,text),public.crm_flat_progress(uuid),public.crm_review_flat_pay(uuid,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.crm_set_flat_plan(uuid,uuid,integer,integer,integer,text),public.crm_flat_progress(uuid),public.crm_review_flat_pay(uuid,uuid,text,integer,text) to service_role;
