-- Track where each property sits in the admin property pipeline.

alter table public.properties
  add column if not exists pipeline_stage text;

update public.properties
set pipeline_stage = 'new_leads'
where pipeline_stage is null
   or pipeline_stage not in (
    'new_leads',
    'walkthrough',
    'quote_sent',
    'contract_out',
    'active'
  );

alter table public.properties
  alter column pipeline_stage set default 'new_leads',
  alter column pipeline_stage set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'properties_pipeline_stage_check'
      and conrelid = 'public.properties'::regclass
  ) then
    alter table public.properties
      add constraint properties_pipeline_stage_check
      check (
        pipeline_stage in (
          'new_leads',
          'walkthrough',
          'quote_sent',
          'contract_out',
          'active'
        )
      );
  end if;
end $$;

create index if not exists properties_pipeline_stage_idx
  on public.properties (pipeline_stage);
