const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function bindAccessManager(root,api,refresh){
 const dialog=document.createElement('dialog');dialog.className='cc-detail';dialog.setAttribute('aria-label','App access roles');root.append(dialog);
 let data,selected='',search='',loading=false;
 const render=()=>{
  const p=data.members.find(p=>p.id===selected);
  dialog.innerHTML=`<header><div><h2>App access roles</h2><p>Choose one or more designations for each account.</p></div><button data-access-close>Close</button></header>
  <div style="padding:20px"><label>Find an account<input data-access-search type="search" placeholder="Name or email" value="${esc(search)}"></label>
  <label>Account<select data-access-member><option value="">Choose an account</option>${data.members.filter(m=>m.id===selected||`${m.full_name} ${m.email}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>a.email.localeCompare(b.email)).map(m=>`<option value="${m.id}" ${m.id===selected?'selected':''}>${esc(m.full_name||m.email)} · ${esc(m.email)}</option>`).join('')}</select></label>
  ${p?`<form data-access-form><h3>${esc(p.full_name||p.email)}</h3><p>${esc(p.email)} · Account ${esc(p.status)}</p><fieldset><legend>Access designations</legend>${data.catalog.map(r=>`<label style="display:block;padding:12px;border-bottom:1px solid #dae4e9"><input type="checkbox" name="roles" value="${r.role}" ${p.roles.includes(r.role)?'checked':''} ${r.role==='admin'&&(p.email.toLowerCase()==='admin@turnlypros.com'||p.id===data.actor)?'disabled':''}> ${esc(r.label)}</label>`).join('')}</fieldset><p>Contractor jobs stay limited to this person’s service areas. Required onboarding and approval still apply. Admin grants broad administrative access.</p><p><strong>Service areas:</strong> ${esc(p.allowed_regions?.join(', ')||'None configured')}</p><p>Brand Ambassador uses the same login, with its own onboarding requirements. Inactive accounts remain inactive.</p><button type="submit" class="primary-action">Save access roles</button></form>`:'<p>Select an account to view and change its roles.</p>'}<p data-access-result role="status"></p></div>`;
 };
 root.addEventListener('click',async e=>{
  const b=e.target.closest('[data-app-access]');if(!b||loading)return;loading=true;b.disabled=true;
  try{data=await api({action:'access_list'});selected=b.dataset.appAccess||'';search='';render();dialog.showModal();}
  catch(error){root.querySelector('#contractorMessage').textContent=error.message;}
  finally{loading=false;b.disabled=false;}
 });
 dialog.addEventListener('click',e=>{if(e.target.closest('[data-access-close]'))dialog.close();});
 dialog.addEventListener('change',e=>{if(e.target.matches('[data-access-member]')){selected=e.target.value;render();}});
 dialog.addEventListener('input',e=>{if(e.target.matches('[data-access-search]')){search=e.target.value;const pos=e.target.selectionStart;render();const input=dialog.querySelector('[data-access-search]');input.focus();input.setSelectionRange(pos,pos);}});
 dialog.addEventListener('submit',async e=>{
  if(!e.target.matches('[data-access-form]'))return;e.preventDefault();
  const p=data.members.find(p=>p.id===selected),roles=new FormData(e.target).getAll('roles');
  if(p.email.toLowerCase()==='admin@turnlypros.com'||p.id===data.actor)roles.push('admin');
  const result=dialog.querySelector('[data-access-result]');
  if(!roles.length){result.textContent='Select at least one role. Use account status to suspend all access.';return;}
  if(roles.includes('admin')&&!p.roles.includes('admin')&&!confirm(`Grant full admin access to ${p.email}?`))return;
  const button=e.target.querySelector('button');button.disabled=true;
  try{await api({action:'access_save',id:selected,roles});data=await api({action:'access_list'});render();dialog.querySelector('[data-access-result]').textContent='Access roles saved in Supabase.';await refresh();}
  catch(error){dialog.querySelector('[data-access-result]').textContent=error.message;}
  finally{if(button.isConnected)button.disabled=false;}
 });
}
