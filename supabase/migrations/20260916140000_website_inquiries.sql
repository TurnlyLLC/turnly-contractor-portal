-- Capture apartment turnover inquiries submitted from TurnlyPros.com.

create table if not exists public.website_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text not null,
  city text,
  facility_type text,
  service_interest text not null default 'Apartment Turnover Cleaning',
  message text,
  sms_consent boolean not null default false,
  source text not null default 'website_contact_form',
  source_url text,
  user_agent text,
  ip_address text,
  status text not null default 'new',
  assigned_to uuid references auth.users(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_inquiries_created_at_idx
  on public.website_inquiries(created_at desc);

create index if not exists website_inquiries_status_idx
  on public.website_inquiries(status);

create or replace function public.set_website_inquiries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_website_inquiries_updated_at on public.website_inquiries;
create trigger set_website_inquiries_updated_at
  before update on public.website_inquiries
  for each row
  execute function public.set_website_inquiries_updated_at();

alter table public.website_inquiries enable row level security;

drop policy if exists "Admins can manage website inquiries" on public.website_inquiries;
create policy "Admins can manage website inquiries"
  on public.website_inquiries
  for all
  to authenticated
  using (coalesce(public.current_user_has_role(array['admin']), false))
  with check (coalesce(public.current_user_has_role(array['admin']), false));

grant select, insert, update, delete on public.website_inquiries to authenticated;