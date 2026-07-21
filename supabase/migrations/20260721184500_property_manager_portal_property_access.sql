-- Let linked property managers read their assigned portal property row.
-- This is additive RLS only; it does not modify or delete any property data.

drop policy if exists "Linked property managers can view portal properties"
  on public.portal_properties;

create policy "Linked property managers can view portal properties"
  on public.portal_properties
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'property_manager'
        and profiles.property_manager_property_id is not null
        and (
          profiles.property_manager_property_id = portal_properties.id
          or public.portal_property_access_matches(
            profiles.property_manager_property_id,
            portal_properties.id
          )
        )
    )
  );

notify pgrst, 'reload schema';
