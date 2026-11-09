const {client,ORIGIN}=require('./mobile-contractor-review.cjs');
const targets=new Map([['item_ced841d17ce84a29941a','Form W-9'],['item_b4c00555d2ca4674bd1f','Bank Verification']]);
const fail=message=>Object.assign(new Error(message),{status:409});
function selected(items){
 const result=items.filter(i=>targets.has(i.id));
 if(result.length!==2||result.some(i=>i.title!==targets.get(i.id)||!i.active||!i.required||typeof i.requiresReview!=='boolean'))throw fail('The shared W-9 or bank verification template changed. Review the settings before applying.');
 return result;
}
async function inspect(token,transport=fetch){
 const {items}=await client(token,transport)('items');selected(items||[]);
 return {items:(items||[]).map(({id,title,kind,required,active,requiresReview})=>({id,title,kind,required,active,requiresReview})),ready:selected(items).every(i=>!i.requiresReview)};
}
async function apply(token,transport=fetch){
 const call=client(token,transport),before=(await call('items')).items||[];
 const items=selected(before);
 const protectedBefore=before.filter(i=>!targets.has(i.id)).map(i=>({id:i.id,requiresReview:i.requiresReview,required:i.required}));
 for(const item of items){
  if(!item.requiresReview)continue;
  let updated=false;
  // Backends use different REST update verbs. Only try another verb when the route explicitly does not exist.
  for(const method of ['PATCH','PUT','POST']){
   const r=await transport(`${ORIGIN}/onboarding/admin/items/${encodeURIComponent(item.id)}`,{method,redirect:'error',headers:{'X-Supabase-Auth':token,'Content-Type':'application/json'},body:JSON.stringify({...item,requiresReview:false}),signal:AbortSignal.timeout(25000)});
   if(r.status===404||r.status===405)continue;
   const data=await r.json().catch(()=>({}));
   if(!r.ok||data.ok===false)throw fail('The shared service could not update '+item.title+'. '+String(data.error||'Please retry.').slice(0,180));
   updated=true;break;
  }
  if(!updated)throw fail('The shared service does not expose a supported template-update route.');
 }
 const after=(await call('items')).items||[];
 if(!selected(after).every(i=>i.requiresReview===false))throw fail('Automatic review could not be confirmed.');
 if(protectedBefore.some(p=>{const a=after.find(i=>i.id===p.id);return !a||a.requiresReview!==p.requiresReview||a.required!==p.required;}))throw fail('Another review setting changed. Inspect the shared checklist.');
 return inspect(token,transport);
}
module.exports={inspect,apply,selected};
