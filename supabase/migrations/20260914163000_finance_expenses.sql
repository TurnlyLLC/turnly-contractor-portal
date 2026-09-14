create table if not exists public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  vendor_name text not null,
  category text not null default 'General',
  description text,
  amount numeric(12, 2) not null default 0,
  due_day integer check (due_day is null or (due_day >= 1 and due_day <= 31)),
  due_date date,
  recurrence text not null default 'monthly',
  status text not null default 'active',
  payment_method text,
  notes text,
  source_label text,
  source_row_number integer,
  paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists finance_expenses_status_idx
  on public.finance_expenses (status);

create index if not exists finance_expenses_due_day_idx
  on public.finance_expenses (due_day);

create index if not exists finance_expenses_due_date_idx
  on public.finance_expenses (due_date);

alter table public.finance_expenses enable row level security;

drop policy if exists finance_expenses_admin_select on public.finance_expenses;
create policy finance_expenses_admin_select
  on public.finance_expenses
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and lower(coalesce(profiles.role::text, '')) in ('admin', 'owner', 'super_admin')
    )
  );

drop policy if exists finance_expenses_admin_insert on public.finance_expenses;
create policy finance_expenses_admin_insert
  on public.finance_expenses
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and lower(coalesce(profiles.role::text, '')) in ('admin', 'owner', 'super_admin')
    )
  );

drop policy if exists finance_expenses_admin_update on public.finance_expenses;
create policy finance_expenses_admin_update
  on public.finance_expenses
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and lower(coalesce(profiles.role::text, '')) in ('admin', 'owner', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and lower(coalesce(profiles.role::text, '')) in ('admin', 'owner', 'super_admin')
    )
  );
