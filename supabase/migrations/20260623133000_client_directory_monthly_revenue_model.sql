begin;

update public.clients
set monthly_recurring_revenue = round(annual_revenue / 12.0, 2)
where replace(lower(coalesce(service_model, '')), '-', '_') in ('monthly_commercial', 'hybrid')
  and replace(lower(coalesce(status, 'active')), '-', '_') = 'active'
  and coalesce(monthly_recurring_revenue, 0) = annual_revenue
  and annual_revenue > 0;

update public.clients
set prospect_projected_revenue = round(annual_revenue / 12.0, 2)
where replace(lower(coalesce(status, '')), '-', '_') = 'prospect'
  and coalesce(prospect_projected_revenue, 0) = annual_revenue
  and annual_revenue > 0;

update public.clients
set projected_turnover_revenue = round(annual_revenue / 12.0, 2)
where replace(lower(coalesce(service_model, '')), '-', '_') in ('apartment_turnover', 'hybrid')
  and replace(lower(coalesce(status, 'active')), '-', '_') = 'active'
  and coalesce(projected_turnover_revenue, 0) = annual_revenue
  and annual_revenue > 0;

update public.clients
set projected_annual_turnovers = coalesce(nullif(projected_annual_turnovers, 0), nullif(unit_count, 0), 0)
where replace(lower(coalesce(service_model, '')), '-', '_') in ('apartment_turnover', 'hybrid');

update public.clients
set monthly_recurring_revenue = 0
where replace(lower(coalesce(service_model, '')), '-', '_') not in ('monthly_commercial', 'hybrid')
   or replace(lower(coalesce(status, 'active')), '-', '_') <> 'active';

update public.clients
set projected_turnover_revenue = 0
where replace(lower(coalesce(service_model, '')), '-', '_') not in ('apartment_turnover', 'hybrid')
   or replace(lower(coalesce(status, 'active')), '-', '_') <> 'active';

update public.clients
set prospect_projected_revenue = 0
where replace(lower(coalesce(status, '')), '-', '_') <> 'prospect';

update public.clients
set unit_count = 0,
    projected_annual_turnovers = 0
where replace(lower(coalesce(service_model, '')), '-', '_') not in ('apartment_turnover', 'hybrid');

update public.clients
set annual_revenue = round((
  case
    when replace(lower(coalesce(status, 'active')), '-', '_') = 'active'
      and replace(lower(coalesce(service_model, '')), '-', '_') in ('monthly_commercial', 'hybrid')
    then coalesce(monthly_recurring_revenue, 0)
    else 0
  end
  +
  case
    when replace(lower(coalesce(status, 'active')), '-', '_') = 'active'
      and replace(lower(coalesce(service_model, '')), '-', '_') in ('apartment_turnover', 'hybrid')
    then coalesce(projected_turnover_revenue, 0)
    else 0
  end
) * 12, 2);

notify pgrst, 'reload schema';

commit;
