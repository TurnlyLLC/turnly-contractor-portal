-- Checklist-linked materials snapshots shared by web and native clients.
alter table public.checklist_templates add column if not exists materials_list jsonb;
alter table public.assignment_blocks add column if not exists materials_list jsonb;
alter table public.assignment_blocks add column if not exists materials_template_id uuid;

create or replace function turnly_private.default_cleaning_materials(kind text)
returns jsonb language sql immutable set search_path = '' as $fn$
 select case kind when 'standard' then $standard${"version":1,"service":"standard","title":"Standard clean — packing list","groups":[{"title":"Equipment & reusable materials","items":[{"name":"Vacuum with floor, upholstery and crevice attachments","note":"Bring clean filters and an empty bag/bin; use the correct head for each surface."},{"name":"Microfiber mop, clean pads and bucket","note":"Bring enough clean pads for the home and keep bathroom pads separate."},{"name":"Broom and dustpan","note":"For loose debris and areas unsuitable for the vacuum."},{"name":"Color-coded microfiber cloths and glass cloths","note":"Separate kitchen, bathroom and toilet cloths; pack clean replacements."},{"name":"Non-scratch sponges, scrub pads and soft scrub brushes","note":"Use only on compatible finishes."},{"name":"Dedicated toilet brush","note":"Keep separate from other cleaning tools."},{"name":"Extendable duster","note":"For reachable fixtures, corners and surface dusting."},{"name":"Cleaning caddy and labeled spray bottles","note":"Keep every product identified; bring manufacturer instructions/SDS access."},{"name":"Charged phone with Turnly access and charger / power bank","note":"Needed for the checklist, notes, required walkthrough videos and any customer opt-out."}]},{"title":"Cleaning products","items":[{"name":"Surface-compatible all-purpose cleaner","note":"For washable counters and general surfaces."},{"name":"Glass and mirror cleaner","note":"Use with a clean lint-free cloth."},{"name":"pH-neutral floor cleaner","note":"Choose the product approved for the floor finish."},{"name":"Bathroom / soap-scum cleaner","note":"Use a finish-compatible product for sinks, tubs and showers."},{"name":"Toilet-bowl cleaner","note":"Use only as labeled; keep separate from other chemicals."},{"name":"Mild dish detergent","note":"For compatible washable items and mild cleaning."},{"name":"Surface-specific cleaner, if needed","note":"Bring stone-safe, wood-safe or stainless-steel products when those finishes are present."},{"name":"EPA-registered kitchen / bathroom surface sanitizer","note":"The standard checklist includes sanitizing sinks and toilets. Use products labeled for those surfaces; clean first, observe label contact time and follow any food-contact rinse directions."}]},{"title":"Consumables & protection","items":[{"name":"Chemical-resistant gloves and label-required PPE","note":"Bring eye protection where the product label requires it."},{"name":"Trash bags and replacement liners","note":"Match the sizes needed for the home."},{"name":"Disposable towels and separate bags for used cloths","note":"Contain dirty materials separately from clean supplies."},{"name":"Non-slip footwear and shoe covers where requested","note":"Use covers only where they do not create a slipping hazard."}]}],"notes":["Pack enough product, cloths, pads and liners for the assigned home size and number of bathrooms. Check job-specific notes before traveling.","Follow product labels for dilution, PPE, ventilation, surface compatibility and any rinsing. Never mix cleaning chemicals.","Test unfamiliar products on an inconspicuous area. Respect homeowner product restrictions and document missing supplies in the checklist; contact Turnly if you cannot complete the assigned scope."]}$standard$::jsonb
 when 'deep' then $deep${"version":1,"service":"deep","title":"Deep clean — packing list","groups":[{"title":"Equipment & reusable materials","items":[{"name":"Vacuum with floor, upholstery and crevice attachments","note":"Bring clean filters and an empty bag/bin; use the correct head for each surface."},{"name":"Microfiber mop, clean pads and bucket","note":"Bring enough clean pads for the home and keep bathroom pads separate."},{"name":"Broom and dustpan","note":"For loose debris and areas unsuitable for the vacuum."},{"name":"Color-coded microfiber cloths and glass cloths","note":"Separate kitchen, bathroom and toilet cloths; pack clean replacements."},{"name":"Non-scratch sponges, scrub pads and soft scrub brushes","note":"Use only on compatible finishes."},{"name":"Dedicated toilet brush","note":"Keep separate from other cleaning tools."},{"name":"Extendable duster","note":"For reachable fixtures, corners and surface dusting."},{"name":"Cleaning caddy and labeled spray bottles","note":"Keep every product identified; bring manufacturer instructions/SDS access."},{"name":"Charged phone with Turnly access and charger / power bank","note":"Needed for the checklist, notes, required walkthrough videos and any customer opt-out."}]},{"title":"Cleaning products","items":[{"name":"Surface-compatible all-purpose cleaner","note":"For washable counters and general surfaces."},{"name":"Glass and mirror cleaner","note":"Use with a clean lint-free cloth."},{"name":"pH-neutral floor cleaner","note":"Choose the product approved for the floor finish."},{"name":"Bathroom / soap-scum cleaner","note":"Use a finish-compatible product for sinks, tubs and showers."},{"name":"Toilet-bowl cleaner","note":"Use only as labeled; keep separate from other chemicals."},{"name":"Mild dish detergent","note":"For compatible washable items and mild cleaning."},{"name":"Surface-specific cleaner, if needed","note":"Bring stone-safe, wood-safe or stainless-steel products when those finishes are present."}]},{"title":"Consumables & protection","items":[{"name":"Chemical-resistant gloves and label-required PPE","note":"Bring eye protection where the product label requires it."},{"name":"Trash bags and replacement liners","note":"Match the sizes needed for the home."},{"name":"Disposable towels and separate bags for used cloths","note":"Contain dirty materials separately from clean supplies."},{"name":"Non-slip footwear and shoe covers where requested","note":"Use covers only where they do not create a slipping hazard."}]},{"title":"Additional deep-clean tools","items":[{"name":"Detail brushes and grout brush","note":"For edges, tracks and compatible grout."},{"name":"Non-scratch plastic scraper","note":"For compatible surfaces only; no razor blades on delicate finishes."},{"name":"Extra microfiber cloths, scrub pads and mop pads","note":"Allow for heavier buildup and more frequent changes."},{"name":"Stable step stool and extension tools","note":"For safely reachable high areas within the assigned scope."}]},{"title":"Additional deep-clean chemicals","items":[{"name":"EPA-registered hard-surface sanitizer","note":"Required for deep cleans. Choose a product labeled for the intended surface and sanitizing use; clean first and keep the surface wet for the label contact time."},{"name":"Food-contact surface sanitizer, where applicable","note":"Required when sanitizing food-contact surfaces. One product may cover both uses if its label permits; follow its food-contact directions and rinse requirements."},{"name":"Surface-compatible degreaser","note":"For heavier kitchen grease; follow label dilution and rinse directions."},{"name":"Limescale / mineral-deposit remover, where compatible","note":"Only for suitable fixtures and surfaces; do not use acidic products on natural stone or other acid-sensitive finishes."},{"name":"Oven cleaner — only if interior oven cleaning is assigned","note":"Use only on an appliance/finish that permits it; check self-cleaning oven restrictions."},{"name":"Specialty stain or grout cleaner — only if needed","note":"Use a compatible product within the checklist scope; do not combine it with other chemicals."}]}],"notes":["Pack enough product, cloths, pads and liners for the assigned home size and number of bathrooms. Check job-specific notes before traveling.","Follow product labels for dilution, PPE, ventilation, surface compatibility and any rinsing. Never mix cleaning chemicals.","Test unfamiliar products on an inconspicuous area. Respect homeowner product restrictions and document missing supplies in the checklist; contact Turnly if you cannot complete the assigned scope.","Sanitizing and disinfecting are different claims. If the checklist specifically requires disinfection, bring an EPA-registered disinfectant labeled for that use and follow its full directions."]}$deep$::jsonb else null end;
$fn$;

create or replace function turnly_private.set_checklist_materials()
returns trigger language plpgsql set search_path = '' as $fn$
declare kind text;
begin
 kind := coalesce(nullif(new.residential_service,''),case lower(new.subdepartment) when 'standard clean' then 'standard' when 'deep clean' then 'deep' end);
 if new.materials_list is null then
   new.materials_list := turnly_private.default_cleaning_materials(kind);
 elsif TG_OP='UPDATE' and new.materials_list is not distinct from old.materials_list
   and new.residential_service is distinct from old.residential_service then
   new.materials_list := turnly_private.default_cleaning_materials(kind);
 end if;
 return new;
end;
$fn$;
create trigger set_checklist_materials before insert or update on public.checklist_templates
 for each row execute function turnly_private.set_checklist_materials();

update public.checklist_templates set materials_list=turnly_private.default_cleaning_materials(residential_service)
 where scope_type='residential' and residential_service in ('standard','deep') and materials_list is null;

create or replace function turnly_private.snapshot_assignment_materials()
returns trigger language plpgsql set search_path = '' as $fn$
declare template_key text; selected_id uuid; selected_list jsonb; unit_key text; property_key text;
begin
 -- Preserve the job snapshot on status changes, autosaves and template-library edits.
 if TG_OP='UPDATE' and new.materials_list is not null
   and new.metadata->>'checklist_template_id' is not distinct from old.metadata->>'checklist_template_id'
   and new.property_id is not distinct from old.property_id
   and new.portal_property_id is not distinct from old.portal_property_id
   and new.unit_id is not distinct from old.unit_id
   and new.metadata->>'unit_id' is not distinct from old.metadata->>'unit_id'
   and new.metadata->>'portal_property_id' is not distinct from old.metadata->>'portal_property_id'
   and new.metadata->>'property_id' is not distinct from old.metadata->>'property_id' then
   return new;
 end if;
 template_key := nullif(new.metadata->>'checklist_template_id','');
 unit_key := coalesce(new.unit_id::text,nullif(new.metadata->>'unit_id',''));
 property_key := coalesce(new.portal_property_id::text,nullif(new.metadata->>'portal_property_id',''),new.property_id::text,nullif(new.metadata->>'property_id',''));
 if template_key is null and unit_key is not null then
   select checklist_template_id::text into template_key from public.property_units where id::text=unit_key;
 end if;
 if template_key is null and property_key is not null then
   select checklist_template_id::text into template_key from public.portal_properties where id::text=property_key;
   if template_key is null then
     select checklist_template_id::text into template_key from public.properties where id::text=property_key;
   end if;
 end if;
 select id,materials_list into selected_id,selected_list from public.checklist_templates where id::text=template_key;
 new.materials_template_id := selected_id;
 new.materials_list := selected_list;
 return new;
end;
$fn$;
create trigger zz_snapshot_assignment_materials before insert or update on public.assignment_blocks
 for each row execute function turnly_private.snapshot_assignment_materials();

-- Backfill only jobs that have not started; never rewrite completed job history.
update public.assignment_blocks a set materials_list=t.materials_list,materials_template_id=t.id
 from public.checklist_templates t
 where a.metadata->>'checklist_template_id'=t.id::text and t.materials_list is not null
 and a.materials_list is null and a.started_at is null and a.completed_at is null
 and a.status in ('pending','open','preferred_pending','claimed','scheduled');

revoke all on function turnly_private.default_cleaning_materials(text) from public,anon;
revoke all on function turnly_private.set_checklist_materials() from public,anon;
revoke all on function turnly_private.snapshot_assignment_materials() from public,anon;
grant usage on schema turnly_private to authenticated,service_role;
grant execute on function turnly_private.default_cleaning_materials(text) to authenticated,service_role;
grant execute on function turnly_private.set_checklist_materials() to authenticated,service_role;
grant execute on function turnly_private.snapshot_assignment_materials() to authenticated,service_role;
notify pgrst, 'reload schema';
