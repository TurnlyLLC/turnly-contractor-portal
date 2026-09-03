-- Admin-managed availability windows for sales walkthrough scheduling.

create table if not exists public.sales_walkthrough_availability (
  id uuid primary key default extensions.gen_random_uuid(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text not null default 'Available walkthrough',
  status text not null default 'open'
    check (status in ('open', 'booked', 'held', 'closed', 'cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists sales_walkthrough_availability_starts_idx
  on public.sales_walkthrough_availability (starts_at);

create index if not exists sales_walkthrough_availability_status_idx
  on public.sales_walkthrough_availability (status, starts_at);

drop trigger if exists sales_walkthrough_availability_touch_updated_at
  on public.sales_walkthrough_availability;
create trigger sales_walkthrough_availability_touch_updated_at
  before update on public.sales_walkthrough_availability
  for each row execute function public.sales_touch_updated_at();

alter table public.sales_walkthrough_availability enable row level security;

drop policy if exists "Sales portal users can view walkthrough availability"
  on public.sales_walkthrough_availability;
create policy "Sales portal users can view walkthrough availability"
  on public.sales_walkthrough_availability for select to authenticated
  using (public.current_user_can_use_sales_portal());

drop policy if exists "Admins can create walkthrough availability"
  on public.sales_walkthrough_availability;
create policy "Admins can create walkthrough availability"
  on public.sales_walkthrough_availability for insert to authenticated
  with check (coalesce(public.current_user_has_role(array['admin']), false));

drop policy if exists "Admins can update walkthrough availability"
  on public.sales_walkthrough_availability;
create policy "Admins can update walkthrough availability"
  on public.sales_walkthrough_availability for update to authenticated
  using (coalesce(public.current_user_has_role(array['admin']), false))
  with check (coalesce(public.current_user_has_role(array['admin']), false));

drop policy if exists "Admins can delete walkthrough availability"
  on public.sales_walkthrough_availability;
create policy "Admins can delete walkthrough availability"
  on public.sales_walkthrough_availability for delete to authenticated
  using (coalesce(public.current_user_has_role(array['admin']), false));

grant select, insert, update, delete on public.sales_walkthrough_availability to authenticated;

comment on table public.sales_walkthrough_availability is 'Admin-managed open windows shown in the sales focus walkthrough picker.';
