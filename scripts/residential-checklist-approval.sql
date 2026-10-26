-- Residential jobs cannot be released without a checklist and any required scope review.
create or replace function turnly_private.guard_residential_checklist_approval()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.metadata->>'source'='residential_booking' and new.status in ('open','preferred_pending','claimed','scheduled','in_progress') and (TG_OP='INSERT' or old.status='pending') then
  if jsonb_typeof(new.property_checklist_items) is distinct from 'array' or jsonb_array_length(new.property_checklist_items)=0 then raise exception 'Attach a residential checklist before approving this assignment.'; end if;
  if new.metadata->>'checklist_review_required'='true' and (nullif(new.metadata->>'checklist_reviewed_at','') is null or not exists(select 1 from profiles where id::text=new.metadata->>'checklist_reviewed_by' and role::text='admin' and status='active')) then raise exception 'An admin must review this scope and checklist before approval.'; end if;
 end if;
 return new;
end;
$$;
create trigger guard_residential_checklist_approval before insert or update on public.assignment_blocks for each row execute function turnly_private.guard_residential_checklist_approval();
