import re,html,json
from pathlib import Path
source=Path('cleaning-scope.html').read_text(encoding='utf-8')
clean=lambda s:html.unescape(re.sub('<[^>]*>','',s)).strip()
scopes={}
for kind in ['standard','deep']:
 body=re.search(r'<section[^>]+id="'+kind+r'-included"[^>]*>(.*?)</section>',source,re.S).group(1)
 groups=[]
 for title,body in re.findall(r'<details[^>]*><summary>(.*?)</summary>(.*?)</details>',body,re.S):
  title=clean(title);tasks=[clean(x) for x in re.findall(r'<li>(.*?)</li>',body,re.S)]
  key='bedroom' if title.startswith('Bedrooms') else 'bathroom' if title.startswith('Bathrooms') else 'kitchen' if title.startswith('Kitchen') else 'common-'+str(len(groups))
  groups.append({'id':key,'title':title,'rooms':[],'items':[{'id':key+'-'+str(i+1),'type':'check','required':True,'label':t,'sort_order':i} for i,t in enumerate(tasks)]})
 assert len(groups)==7 and any(g['id']=='kitchen' for g in groups)
 excluded=re.search(r'<section[^>]+id="'+kind+r'-excluded"[^>]*>(.*?)</section>',source,re.S).group(1)
 exclusions=[clean(x) for x in re.findall(r'<li>(.*?)</li>',excluded,re.S)]
 scopes[kind]={'sections':groups,'exclusions':exclusions}
Path('lib/residential-checklist-scopes.json').write_text(json.dumps(scopes,indent=2,ensure_ascii=False),encoding='utf-8')
header='''-- Residential scopes are taken verbatim from the published booking policy.
alter table public.checklist_templates add column if not exists scope_type text not null default 'commercial';
alter table public.checklist_templates add column if not exists residential_service text;
alter table public.checklist_templates add column if not exists residential_beds integer;
alter table public.checklist_templates add column if not exists residential_baths numeric;
create unique index if not exists residential_checklist_exact_match on public.checklist_templates(residential_service,residential_beds,residential_baths) where scope_type='residential';
'''
body='''do $seed$
declare catalog jsonb := $catalog$CATALOG$catalog$::jsonb; service text; beds integer; half_baths integer; n integer; section jsonb; copy jsonb; sections jsonb; prefix text; title text; note text;
begin
 foreach service in array array['standard','deep'] loop
  note := 'Published scope: https://portal.turnlypros.com/cleaning-scope.html#'||service||'-included. Only safely accessible areas; do not move heavy furniture or use ladders. Add-ons require separate approval and are not included in this base checklist. Exclusions: '||(select string_agg(value,'; ') from jsonb_array_elements_text(catalog->service->'exclusions'));
  for beds in 1..7 loop
   for half_baths in 2..14 loop
    sections := '[]'::jsonb;
    for section in select value from jsonb_array_elements(catalog->service->'sections') loop
     for n in 1..(case section->>'id' when 'bedroom' then beds when 'bathroom' then (half_baths+1)/2 else 1 end) loop
      prefix := (section->>'id')||'-'||n;
      title := case section->>'id' when 'bedroom' then 'Bedroom '||n when 'bathroom' then case when half_baths%2=1 and n=(half_baths+1)/2 then 'Half bathroom (toilet and sink; no tub or shower)' else 'Full bathroom '||n end else section->>'title' end;
      copy := section || jsonb_build_object('id',prefix,'title',title,'sort_order',jsonb_array_length(sections),'description','Complete applicable tasks for safely accessible surfaces. Report inaccessible areas or conditions outside the booked scope.','items',
       (select jsonb_agg(item || jsonb_build_object('id',prefix||'-'||(item->>'id'))) from jsonb_array_elements(section->'items') item
        where not (section->>'id'='bathroom' and half_baths%2=1 and n=(half_baths+1)/2 and (item->>'label') ~* 'shower|bathtub')));
      sections := sections || jsonb_build_array(copy);
     end loop;
    end loop;
    sections := jsonb_build_array(jsonb_build_object('id','arrival','title','Arrival and scope verification','rooms','[]'::jsonb,'items',jsonb_build_array(
     jsonb_build_object('id','arrival-scope','type','check','required',true,'label','Confirm booked service and room counts. Review exclusions and separately approved add-ons; report discrepancies before starting.'),
     jsonb_build_object('id','arrival-safety','type','check','required',true,'label','Check safe access, running water, electricity, pets, delicate surfaces and pre-existing damage. Report unsafe conditions; do not perform excluded or hazardous work.')))) || sections || jsonb_build_array(jsonb_build_object('id','finish','title','Final quality review','rooms','[]'::jsonb,'items',jsonb_build_array(
     jsonb_build_object('id','finish-review','type','check','required',true,'label','Recheck each included room for missed tasks, streaks and residue. Return lightweight items safely and secure the property as instructed.'),
     jsonb_build_object('id','finish-note','type','note','required',true,'label','Record any inaccessible areas, pre-existing damage, skipped tasks or scope concerns; write None if there are no exceptions.'))));
    insert into public.checklist_templates(name,department,subdepartment,description,sections,scope_type,residential_service,residential_beds,residential_baths)
    values('Residential | '||initcap(service)||' | '||beds||' bed / '||trim(trailing '.' from trim(trailing '0' from to_char(half_baths/2.0,'FM9.0')))||' bath','Residential Cleaning',initcap(service)||' clean',note,sections,'residential',service,beds,half_baths/2.0)
    on conflict(residential_service,residential_beds,residential_baths) where scope_type='residential' do nothing;
   end loop;
  end loop;
 end loop;
end;
$seed$;
'''.replace('CATALOG',json.dumps(scopes,ensure_ascii=False))
Path('supabase/migrations/20261026142825_residential_scope_checklists.sql').write_text(header+body+Path('scripts/residential-checklist-approval.sql').read_text(encoding='utf-8'),encoding='utf-8')
print('Built 182 combinations from',[(k,len(v['sections'])) for k,v in scopes.items()])
