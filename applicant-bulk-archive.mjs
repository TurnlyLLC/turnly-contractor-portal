export function createBulkArchive({api,reload,setBusy}){
 const selected=new Map();let rows=[],scope='',pool='active',running=false,loading=false;
 const $=s=>document.querySelector(s);
 function render(){
  $('#archiveSelectionCount').textContent=`${selected.size} selected`;
  $('#bulkArchiveAction').textContent=pool==='archived'?'Restore selected':'Archive selected';
  $('#bulkArchiveAction').disabled=running||loading||!selected.size;
  $('#clearArchiveSelection').disabled=running||loading||!selected.size;
  const eligible=rows.filter(r=>r.status!=='hired');
  document.querySelectorAll('[data-select-applicant]').forEach(el=>{el.checked=selected.has(el.dataset.selectApplicant);el.disabled=running||loading;});
  const all=$('[data-select-applicant-page]');
  if(all){const count=eligible.filter(r=>selected.has(r.id)).length;all.checked=!!eligible.length&&count===eligible.length;all.indeterminate=count>0&&count<eligible.length;all.disabled=running||loading||!eligible.length;}
 }
 $('#results').addEventListener('change',e=>{
  if(running||loading)return;
  if(e.target.matches('[data-select-applicant-page]'))for(const row of rows.filter(r=>r.status!=='hired')){if(e.target.checked)selected.set(row.id,{...row});else selected.delete(row.id);}
  else if(e.target.matches('[data-select-applicant]')){const row=rows.find(r=>r.id===e.target.dataset.selectApplicant);if(row&&row.status!=='hired'){if(e.target.checked)selected.set(row.id,{...row});else selected.delete(row.id);}}
  render();
 });
 $('#clearArchiveSelection').onclick=()=>{if(running)return;selected.clear();render();};
 $('#bulkArchiveAction').onclick=async()=>{
  if(running||loading||!selected.size)return;
  const batch=[...selected.values()],action=pool==='archived'?'restore':'archive';
  running=true;setBusy(true);render();
  const controls=[...document.querySelectorAll('#filters input,#filters select,#filters button,#activeRecruits,#archivedRecruits,#previous,#next,#bulkHire')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);
  const errors=$('#archiveBatchErrors');errors.replaceChildren();let done=0,failed=0;
  try{
   for(const row of batch){
    $('#archiveBatchProgress').textContent=`${action==='archive'?'Archiving':'Restoring'} ${done+failed+1} of ${batch.length}… Keep this page open.`;
    try{await api(action,{id:row.id,version:row.version});selected.delete(row.id);done++;}
    catch(error){failed++;const item=document.createElement('li');item.textContent=`${row.name}: ${error.message}`;errors.append(item);}
   }
  }finally{
   running=false;setBusy(false);controls.forEach(([el,disabled])=>el.disabled=disabled);
   await reload();
   $('#archiveBatchProgress').textContent=`${done} ${action==='archive'?'archived':'restored to active recruits'}. ${failed?`${failed} could not be changed; see details below.`:'All selected applicants were updated.'}`;
   render();
  }
 };
 return {
  prepare(filters){const next=JSON.stringify(filters);if(next!==scope){selected.clear();$('#archiveBatchProgress').textContent='';$('#archiveBatchErrors').replaceChildren();}scope=next;pool=filters.pool;rows=[];loading=true;render();},
  update(next){rows=next;for(const row of rows){if(selected.has(row.id))selected.set(row.id,{...row});}loading=false;render();},
  failed(){rows=[];loading=true;render();}
 };
}
