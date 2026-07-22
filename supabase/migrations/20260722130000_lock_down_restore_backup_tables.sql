-- Restore backup tables should never be exposed through browser-facing roles.
-- Keep the data available to database owners/service-role tooling, but remove
-- anon/authenticated access and enable RLS so Supabase Security Advisor clears.

do $$
declare
  backup_table text;
begin
  foreach backup_table in array array[
    'client_contracts_note_restore_backup_20260715170612',
    'client_contracts_note_restore_backup_20260715170759',
    'client_contracts_note_restore_backup_20260715170917',
    'clients_note_restore_backup_20260715170612',
    'clients_note_restore_backup_20260715170759',
    'clients_note_restore_backup_20260715170917'
  ]
  loop
    execute format('alter table if exists public.%I enable row level security', backup_table);
    execute format('revoke all privileges on table public.%I from anon, authenticated', backup_table);
  end loop;
end $$;
