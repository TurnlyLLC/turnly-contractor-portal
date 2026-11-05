export async function mountOnboardingSettings(root, request) {
 const labels={training:'Require training (all current and future materials)',introduction:'Initial introduction video',agreement:'Sign the current agreement',portal:'Playbook walkthrough video',playbook:'Playbook review confirmation'};
 let data;
 root.innerHTML='<article class="sales-panel"><h2>Sales onboarding requirements</h2><p>These settings apply to the whole sales team. Turning off all training makes individual training switches optional. The agreement has its own switch.</p><form><label>Apply settings to <select data-scope><option value="team">Whole sales team</option></select></label><div data-fields></div><button class="sales-primary-button">Save requirements</button><p role="status"></p></form></article>';
 const form=root.querySelector('form'),scope=root.querySelector('[data-scope]'),fields=root.querySelector('[data-fields]'),message=root.querySelector('[role=status]');
 function paint(){
  fields.replaceChildren();
  const settings=data.rules.find(row=>row.scope===scope.value)?.requirements||{};
  for(const [key,label]of Object.entries(labels)){
   const line=document.createElement('label');line.style.cssText='display:flex;gap:12px;align-items:center;margin:16px 0';
   const select=document.createElement('select');select.name=key;
   if(scope.value!=='team')select.add(new Option('Use team setting','inherit'));
   select.add(new Option('On — required','true'));select.add(new Option('Off — optional','false'));
   select.value=key in settings?String(settings[key]):scope.value==='team'?'true':'inherit';
   line.append(select,document.createTextNode(label));fields.append(line);
  }
 }
 try{
  data=await request('onboarding',{action:'rules'});

  scope.onchange=()=>{paint();message.textContent=''};paint();
 }catch(error){message.textContent=error.message;form.querySelector('button').disabled=true;return}
 form.onsubmit=async event=>{
  event.preventDefault();const button=form.querySelector('button');button.disabled=true;
  const requirements={};
  for(const select of fields.querySelectorAll('select'))if(select.value!=='inherit')requirements[select.name]=select.value==='true';
  try{data=await request('onboarding',{action:'save_rules',scope:scope.value,requirements});paint();message.textContent='Saved. Salespeople receive the updated requirements on their next page load.'}
  catch(error){message.textContent=error.message}
  finally{button.disabled=false}
 };
}

