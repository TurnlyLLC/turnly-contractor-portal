create or replace function public.communication_totals(p_user uuid default null::uuid)
returns jsonb language sql stable set search_path=public as $$
with bounds as(select date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' d,date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' m),
x as(select coalesce(sum(reserved_cents) filter(where state='reserved'),0) held,
coalesce(sum(actual_cents) filter(where state='settled' and created_at>=b.d),0) d,
coalesce(sum(actual_cents) filter(where state='settled' and created_at>=b.m),0) m,
count(*) filter(where state='settled' and actual_cents is null and created_at>=b.m) pending
from communication_usage cross join bounds b where p_user is null or user_id=p_user),
v as(select x.*,case when p_user is null then case when p.day=(now() at time zone 'UTC')::date then p.daily_cents else 0 end else x.d end actual_d,
case when p_user is null then case when p.month=date_trunc('month',now() at time zone 'UTC')::date then p.monthly_cents else 0 end else x.m end actual_m,
p.synced_at from x left join communication_provider_usage p on p.id)
select jsonb_build_object('held_cents',held,'daily_cents',held+coalesce(actual_d,0),'monthly_cents',held+coalesce(actual_m,0),
'actual_daily_cents',actual_d,'actual_monthly_cents',actual_m,'pending_pricing_count',pending,'synced_at',synced_at,'basis','twilio') from v;
$$;
revoke all on function public.communication_totals(uuid) from public,anon,authenticated;
grant execute on function public.communication_totals(uuid) to service_role;