-- Add only a read permission to the existing key scope allowlist.
do $$
declare c record; definition text;
begin
 select conname,pg_get_constraintdef(oid) as def into strict c from pg_constraint
 where conrelid='public.integration_keys'::regclass and contype='c'
 and pg_get_constraintdef(oid) like '%cardinality(scopes)%';
 if position('email:read' in c.def)=0 then
  definition=replace(c.def,'ARRAY[','ARRAY[''email:read''::text, ');
  if definition=c.def then raise exception 'Unexpected scope allowlist format';end if;
  execute format('alter table public.integration_keys drop constraint %I',c.conname);
  execute format('alter table public.integration_keys add constraint %I %s',c.conname,definition);
 end if;
end $$;
