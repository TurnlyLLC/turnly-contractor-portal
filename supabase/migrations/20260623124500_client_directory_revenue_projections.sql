alter table public.clients
  add column if not exists monthly_recurring_revenue numeric(12, 2) not null default 0,
  add column if not exists prospect_projected_revenue numeric(12, 2) not null default 0,
  add column if not exists projected_annual_turnovers integer not null default 0,
  add column if not exists projected_turnover_revenue numeric(12, 2) not null default 0;

update public.clients
set
  monthly_recurring_revenue = case
    when monthly_recurring_revenue > 0 then monthly_recurring_revenue
    when service_model in ('monthly_commercial', 'hybrid') and coalesce(annual_revenue, 0) > 0 then round(annual_revenue / 12, 2)
    else 0
  end,
  prospect_projected_revenue = case
    when prospect_projected_revenue > 0 then prospect_projected_revenue
    when status = 'prospect' and coalesce(annual_revenue, 0) > 0 then annual_revenue
    else 0
  end,
  projected_turnover_revenue = case
    when projected_turnover_revenue > 0 then projected_turnover_revenue
    when service_model in ('apartment_turnover', 'hybrid') and coalesce(annual_revenue, 0) > 0 then annual_revenue
    else 0
  end,
  projected_annual_turnovers = greatest(coalesce(projected_annual_turnovers, 0), 0)
where true;

alter table public.clients
  alter column monthly_recurring_revenue set default 0,
  alter column monthly_recurring_revenue set not null,
  alter column prospect_projected_revenue set default 0,
  alter column prospect_projected_revenue set not null,
  alter column projected_annual_turnovers set default 0,
  alter column projected_annual_turnovers set not null,
  alter column projected_turnover_revenue set default 0,
  alter column projected_turnover_revenue set not null;

create index if not exists clients_monthly_recurring_revenue_idx
  on public.clients (monthly_recurring_revenue);

create index if not exists clients_projected_turnover_revenue_idx
  on public.clients (projected_turnover_revenue);

notify pgrst, 'reload schema';