export async function mountOnboardingSettings(root, request, memberId=null) {
 const labels={training:'Require training (all current and future materials)',introduction:'Initial introduction video',agreement:'Sign the current agreement',portal:'Playbook walkthrough video',playbook:'Playbook review confirmation'};
 let data;
 root.innerHTML='<article class="sales-panel"><h2>Sales onboarding requirements</h2><p>Choose an individual member to override the team defaults. Turning off training makes all current and future training optional for that member. Agreement signing has its own switch.</p><form><label>Apply settings to <select data-scope><option value="team">Whole sales team (defaults)</option></select></label><div data-fields></div><button class="sales-primary-button">Save requirements</button><button type="button" data-off class="sales-secondary-button">Turn all requirements off</button><p role="status"></p></form></article>';
 const form=root.querySelector('form'),scope=root.querySelector('[data-scope]'),fields=root.querySelector('[data-fields]'),message=root.querySelector('[role=status]');
 function paint(){
  fields.replaceChildren();
  const settings=data.rules.find(row=>row.scope===scope.value)?.requirements||{};
  for(const [key,label]of Object.entries(labels)){
   const line=document.createElement('label');line.style.cssText='display:flex;gap:12px;align-items:center;margin:16px 0';
   const select=document.createElement('select');select.name=key;
   if(scope.value!=='team')select.add(new Option('Use team setting ('+((data.rules.find(r=>r.scope==='team')?.requirements?.[key]??true)?'on':'off')+')','inherit'));
   select.add(new Option('On — required','true'));select.add(new Option('Off — optional','false'));
   select.value=key in settings?String(settings[key]):scope.value==='team'?'true':'inherit';
   line.append(select,document.createTextNode(label));fields.append(line);
  }
 }
 try{
  data=await request('onboarding',{action:'rules'});
  for(const member of data.members||[])scope.add(new Option(member.full_name||'Sales member',member.id));
  if(memberId){scope.value=memberId;scope.disabled=true;if(scope.value!==memberId)throw Error('This member is not available for onboarding changes.');}
  scope.onchange=()=>{paint();message.textContent=''};paint();
 }catch(error){message.textContent=error.message;form.querySelector('button').disabled=true;return}
 root.querySelector('[data-off]').onclick=()=>{for(const select of fields.querySelectorAll('select'))select.value='false';message.textContent='All requirements set to off for the selected scope. Click Save requirements to apply.';};
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;
  const requirements={};
  for(const select of fields.querySelectorAll('select'))if(select.value!=='inherit')requirements[select.name]=select.value==='true';
  try{data=await request('onboarding',{action:'save_rules',scope:scope.value,requirements});paint();message.textContent=scope.value==='team'?'Team defaults saved. Individual overrides remain in effect.':'Saved for this member only. Changes apply on their next page load.'}
  catch(error){message.textContent=error.message}
  finally{button.disabled=false}
 };
}

