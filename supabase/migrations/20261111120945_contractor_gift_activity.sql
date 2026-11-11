alter table public.gift_orders add column service_zone text check(service_zone in ('NC:Raleigh','NC:Durham','NC:Asheville','NC:Greensboro'));
create or replace function public.contractor_gift_activity(p_zones text[])
returns table(zone text,sold bigint,awaiting_redemption bigint)
language sql stable security invoker set search_path='' as $$
 select z.zone,count(c.id),count(c.id) filter(where c.status='active' and c.balance_cents=10000 and c.reserved_cents=0)
 from unnest(p_zones) z(zone)
 left join public.gift_orders o on o.service_zone=z.zone and o.status='paid' and o.paid_at is not null and coalesce(o.refunded_cents,0)=0 and not coalesce(o.disputed,false)
 left join public.gift_cards c on c.order_id=o.id and c.status in ('active','spent')
 group by z.zone;
$$;
revoke all on function public.contractor_gift_activity(text[]) from public,anon,authenticated;
grant execute on function public.contractor_gift_activity(text[]) to service_role;
notify pgrst,'reload schema';
