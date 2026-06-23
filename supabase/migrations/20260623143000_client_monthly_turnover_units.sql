begin;

alter table public.clients
  add column if not exists projected_monthly_turnovers jsonb not null default '{}'::jsonb;

update public.clients
set projected_monthly_turnovers = jsonb_build_object(
  'jan', greatest(coalesce(projected_annual_turnovers, 0), 0),
  'feb', 0,
  'mar', 0,
  'apr', 0,
  'may', 0,
  'jun', 0,
  'jul', 0,
  'aug', 0,
  'sep', 0,
  'oct', 0,
  'nov', 0,
  'dec', 0
)
where replace(lower(coalesce(service_model, '')), '-', '_') in ('apartment_turnover', 'hybrid')
  and coalesce(projected_monthly_turnovers, '{}'::jsonb) = '{}'::jsonb
  and coalesce(projected_annual_turnovers, 0) > 0;

update public.clients
set projected_monthly_turnovers = '{}'::jsonb,
    projected_annual_turnovers = 0
where replace(lower(coalesce(service_model, '')), '-', '_') not in ('apartment_turnover', 'hybrid');

notify pgrst, 'reload schema';

commit;
