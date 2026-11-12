export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function visible(q,fields){if(!q.when)return true;const v=fields[q.when.ref],want=q.when.value.toLowerCase();return Array.isArray(v)?v.some(a=>String(a).toLowerCase()===want):v===true?['yes','agreed','true'].includes(want):typeof v==='string'&&v.trim().toLowerCase()===want;}
export function initialFields(item,profile,identity){const values={};for(const q of item.fields||[]){const old=item.submission?.answers?.find?.(a=>a.id===q.id);if(old&&!q.sensitive&&!['tin','account','routing'].includes(q.type)){values[q.id]=q.type==='check'?old.value==='Agreed':q.type==='multi'?String(old.value||'').split(', ').filter(Boolean):old.value;}else if(q.profile&&profile[q.profile]!==undefined)values[q.id]=profile[q.profile];else if(q.prefill&&identity[q.prefill])values[q.id]=identity[q.prefill];}return values;}
// Read actual controls before navigation/submission: autofill and some mobile
// keyboards do not reliably dispatch input events.
export function captureForm(form,e){
 for(const t of form.querySelectorAll('[data-field]')) if(!t.disabled)e.fields[t.dataset.field]=t.type==='checkbox'?t.checked:t.value;
 const multi=[...form.querySelectorAll('[data-multi]')].filter(t=>!t.disabled);
 for(const id of new Set(multi.map(t=>t.dataset.multi)))e.fields[id]=multi.filter(t=>t.dataset.multi===id&&t.checked).map(t=>t.value);
 for(const t of form.querySelectorAll('[data-confirm]'))if(!t.disabled)e.confirm[t.dataset.confirm]=t.value;
 const signer=form.querySelector('#signer');if(signer)e.signerName=signer.value;
}
export function validationIssue(item,fields,confirm,section=null){
 for(const q of item.fields||[]){
  if(!visible(q,fields)||(section!==null&&(q.section||'Your information')!==section))continue;
  const value=fields[q.id],empty=value==null||value===''||(Array.isArray(value)&&!value.length);
  if(q.required&&(empty||(q.type==='check'&&!value)))return {field:q,message:'Please complete: '+q.label};
  if(q.confirm&&!empty&&String(value)!==String(confirm[q.id]||''))return {field:q,message:'Please confirm '+q.label+' in its section.'};
 }
 return null;
}
export class SaveQueue{
 constructor(save,notify=()=>{}){this.save=save;this.notify=notify;this.dirty=false;this.pending=false;this.serial=Promise.resolve();this.timer=null;this.error=null;}
 changed(){this.dirty=true;this.notify('Unsaved changes');clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush().catch(()=>{}),650);}
 flush(){clearTimeout(this.timer);this.serial=this.serial.catch(()=>{}).then(async()=>{while(this.dirty){this.dirty=false;this.notify('Saving…');this.pending=true;try{await this.save();this.error=null;}catch(e){this.dirty=true;this.error=e;this.notify(e.message,true);throw e;}finally{this.pending=false;}}this.notify('All changes saved');});return this.serial;}
}
