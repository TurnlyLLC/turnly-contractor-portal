// Produce a fixed allowlist migration from the checked public API contract.
const fs=require('node:fs'),C=require('../lib/integration-catalog.cjs'),schema=require('../tests/fixtures/admin-schema.json');
const configs=Object.fromEntries(Object.entries(C.resources).filter(([,r])=>r.write.length).map(([n,r])=>[n,{table:r.table,fields:r.write,required:r.required,create:r.create!==false,updated:r.fields.includes('updated_at'),created_by:!!schema[r.table].created_by,filter:r.filter||{}}]));
let sql=fs.readFileSync('docs/integration-admin-resources.sql','utf8');
sql=sql.replace(/\$config\$.*?\$config\$/s,'$config$'+JSON.stringify(configs)+'$config$');
sql=sql.replace("payload:=payload||jsonb_build_object('created_by',k.created_by);","if (cfg->>'created_by')::boolean then payload:=payload||jsonb_build_object('created_by',k.created_by);end if;");
sql=sql.replace('payload:=p_data;',()=>"if k.deny_record_deletion and exists(select 1 from jsonb_each_text(p_data) x where x.key~'(^|_)status$' and lower(x.value) in ('deleted','removed','purged','destroyed')) then raise exception 'record_deletion_disabled';end if;\n payload:=p_data;");
fs.writeFileSync('docs/integration-admin-resources-expanded.sql',sql);
console.log({resources:Object.keys(configs).length,bytes:Buffer.byteLength(sql)});
