create table public.business_atlas (
  id smallint primary key check (id = 1),
  template text not null,
  edits jsonb not null default '{}'::jsonb check (jsonb_typeof(edits) = 'object'),
  revision integer not null default 1
);
alter table public.business_atlas enable row level security;
revoke all on public.business_atlas from anon, authenticated, public;
grant select, update (edits, revision) on public.business_atlas to authenticated;
create policy atlas_admin_read on public.business_atlas for select to authenticated
using ((select public.current_user_is_admin()));
create policy atlas_admin_edit on public.business_atlas for update to authenticated
using ((select public.current_user_is_admin())) with check ((select public.current_user_is_admin()));
