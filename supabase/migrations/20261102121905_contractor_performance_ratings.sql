create table public.contractor_rating_exclusions (
 contractor_id uuid not null references public.profiles(id), booking_id uuid not null,
 rating_exclusion_reason text, reviewed_by uuid not null references public.profiles(id),
 review_reason text not null check(length(trim(review_reason)) between 3 and 1000),
 reviewed_at timestamptz not null default now(), primary key(contractor_id,booking_id)
);
alter table public.contractor_rating_exclusions enable row level security;
revoke all on public.contractor_rating_exclusions from public,anon,authenticated;
grant select,insert,update on public.contractor_rating_exclusions to service_role;
create view public.contractor_rated_jobs with (security_invoker=true) as
 with sources as (
 select f.contractor_id,b.id booking_id,b.customer_id,'Residential'::text channel,
 f.contractor_rating,f.comments,coalesce(b.completed_at,f.created_at) created_at,1 priority,f.submitted_at reviewed_at
 from public.residential_feedback f join public.referral_bookings b on b.id=f.booking_id
 where b.status='completed' and f.submitted_at is not null
 union all
 select r.cleaner_id,b.id,b.customer_id,'Residential',r.cleaner_rating,r.private_feedback,
 coalesce(b.completed_at,r.created_at),2,r.updated_at
 from public.residential_cleaner_ratings r join public.referral_bookings b on b.id=r.booking_id
 join public.assignment_blocks j on j.id=b.id and r.cleaner_id=coalesce(j.claimed_by,j.assigned_to)
 where b.status='completed'
 union all
 select f.contractor_id,j.id,f.created_by,'Commercial',f.rating,f.message,coalesce(j.completed_at,f.created_at),1,f.updated_at
 from public.property_manager_clean_feedback f join public.assignment_blocks j on j.id=f.assignment_id
 where j.status in ('complete','completed','approved','paid','done','closed') and f.created_by is not null
 and f.contractor_id=coalesce(j.claimed_by,j.assigned_to) and coalesce(j.metadata->>'source','')<>'residential_booking'
 ), distinct_jobs as (
 select distinct on (contractor_id,booking_id) * from sources
 where contractor_id is not null and contractor_rating between 1 and 5
 order by contractor_id,booking_id,priority,reviewed_at desc nulls last,contractor_rating desc
 )
 select j.contractor_id,j.booking_id,j.customer_id,j.channel,j.contractor_rating,j.comments,j.created_at,e.rating_exclusion_reason
 from distinct_jobs j left join public.contractor_rating_exclusions e using(contractor_id,booking_id);
revoke all on public.contractor_rated_jobs from public,anon,authenticated;
grant select on public.contractor_rated_jobs to service_role;
create table public.contractor_rating_decisions (
 id bigint generated always as identity primary key, contractor_id uuid not null references public.profiles(id),
 actor_id uuid not null references public.profiles(id), decision text not null check(decision in ('pause','restore')),
 reason text not null check(length(trim(reason)) between 3 and 1000), created_at timestamptz not null default now()
);
create index contractor_rating_latest_decision on public.contractor_rating_decisions(contractor_id,id desc);
alter table public.contractor_rating_decisions enable row level security;
revoke all on public.contractor_rating_decisions from public,anon,authenticated;
grant select,insert on public.contractor_rating_decisions to service_role;
grant usage on sequence public.contractor_rating_decisions_id_seq to service_role;

create function public.contractor_rating_summary(p_contractor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with authorized as (
 select p_contractor as id where p_contractor=(select auth.uid()) or coalesce(auth.role(),'')='service_role'
 or exists(select 1 from public.profiles where id=(select auth.uid()) and role::text='admin' and status='active')
 ), latest_customer as (
 select distinct on (f.customer_id) f.customer_id,f.booking_id,f.contractor_rating,f.created_at
 from public.contractor_rated_jobs f join authorized a on a.id=f.contractor_id
 where f.rating_exclusion_reason is null order by f.customer_id,f.created_at desc,f.booking_id
 ), recent as (select * from latest_customer order by created_at desc,booking_id limit 50),
 stats as (select count(*) n,avg(contractor_rating) score,count(*) filter(where contractor_rating<=4) low from recent),
 decision as (select d.decision,d.reason from public.contractor_rating_decisions d join authorized a on a.id=d.contractor_id order by d.id desc limit 1)
 select jsonb_build_object('count',n,'average',round(score,2),'low_count',low,'status',
 case when n=0 then 'unrated' when n<10 then 'building' when score>=4.3 then 'good' when low<3 then 'watch'
 when (select decision from decision)='pause' then 'paused' else 'review' end,
 'note',(select reason from decision where decision='pause'))
 from stats where exists(select 1 from authorized)
$$;
revoke all on function public.contractor_rating_summary(uuid) from public,anon;
grant execute on function public.contractor_rating_summary(uuid) to authenticated,service_role;

create function public.guard_rating_claim() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.claimed_by is not null and new.claimed_by is distinct from old.claimed_by then
  if (public.contractor_rating_summary(new.claimed_by)->>'status')='paused' then
   raise exception 'New job claims are paused after a performance review. Open Performance or contact Turnly for review.';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_rating_claim() from public,anon,authenticated;
create trigger guard_rating_claim before update of claimed_by on public.assignment_blocks for each row execute function public.guard_rating_claim();
