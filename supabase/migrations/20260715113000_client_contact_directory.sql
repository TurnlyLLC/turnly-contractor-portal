create extension if not exists pgcrypto;

create table if not exists public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null default '',
  cell_phone text not null default '',
  email text not null default '',
  office_phone text not null default '',
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_contacts
  add column if not exists client_id uuid references public.clients(id) on delete cascade,
  add column if not exists name text not null default '',
  add column if not exists cell_phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists office_phone text not null default '',
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_contacts_set_updated_at on public.client_contacts;

create trigger client_contacts_set_updated_at
  before update on public.client_contacts
  for each row
  execute function public.set_updated_at();

insert into public.client_contacts (
  client_id,
  name,
  cell_phone,
  email,
  office_phone,
  sort_order
)
select
  clients.id,
  clients.primary_contact_name,
  clients.primary_contact_phone,
  clients.primary_contact_email,
  '',
  0
from public.clients
where (
    nullif(trim(clients.primary_contact_name), '') is not null
    or nullif(trim(clients.primary_contact_phone), '') is not null
    or nullif(trim(clients.primary_contact_email), '') is not null
  )
  and not exists (
    select 1
    from public.client_contacts
    where client_contacts.client_id = clients.id
      and lower(trim(client_contacts.name)) = lower(trim(clients.primary_contact_name))
      and lower(trim(client_contacts.email)) = lower(trim(clients.primary_contact_email))
      and regexp_replace(client_contacts.cell_phone, '\D', '', 'g') = regexp_replace(clients.primary_contact_phone, '\D', '', 'g')
  );

create index if not exists client_contacts_client_id_idx
  on public.client_contacts (client_id);

create index if not exists client_contacts_name_idx
  on public.client_contacts (name);

create index if not exists client_contacts_updated_at_idx
  on public.client_contacts (updated_at desc);

alter table public.client_contacts enable row level security;

drop policy if exists "Authenticated users can read client contacts" on public.client_contacts;
create policy "Authenticated users can read client contacts"
  on public.client_contacts for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can create client contacts" on public.client_contacts;
create policy "Authenticated users can create client contacts"
  on public.client_contacts for insert
  to authenticated
  with check (created_by is null or created_by = auth.uid());

drop policy if exists "Authenticated users can update client contacts" on public.client_contacts;
create policy "Authenticated users can update client contacts"
  on public.client_contacts for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete client contacts" on public.client_contacts;
create policy "Authenticated users can delete client contacts"
  on public.client_contacts for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.client_contacts to authenticated;

notify pgrst, 'reload schema';
