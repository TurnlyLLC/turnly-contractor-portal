create table public.gift_ad_attribution (
 order_id uuid primary key references public.gift_orders(id) on delete cascade,
 fbc text check (length(fbc)<=550),
 fbp text check (length(fbp)<=60),
 consent_version text not null,
 consented_at timestamptz not null default now(),
 attempted_at timestamptz,
 sent_at timestamptz
);
alter table public.gift_ad_attribution enable row level security;
revoke all on public.gift_ad_attribution from public, anon, authenticated;
grant select, insert, update on public.gift_ad_attribution to service_role;
create index gift_ad_attribution_pending on public.gift_ad_attribution(attempted_at nulls first) where sent_at is null;
