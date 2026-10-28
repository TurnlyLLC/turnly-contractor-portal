import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
const env=window.__ENV||{},client=createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY),form=document.querySelector('#passwordForm'),message=document.querySelector('#passwordMessage');
const session=(await client.auth.getSession()).data?.session;
if(!session)location.replace('sales-login.html');
document.querySelector('#backToLogin').addEventListener('click',async e=>{e.preventDefault();await client.auth.signOut();location.assign('sales-login.html');});
form.addEventListener('submit',async e=>{
 e.preventDefault();const button=form.querySelector('button');button.disabled=true;message.textContent='';
 try{
  if(form.password.value!==form.confirm.value)throw new Error('The new passwords do not match.');
  const response=await fetch('/api/crm-team',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({action:'change_password',confirm_password:form.confirm.value,password:form.password.value})});
  const result=await response.json();if(!response.ok)throw new Error(result.error);
  form.reset();await client.auth.signOut();form.hidden=true;message.textContent='Password saved. Sign in with your username and new password.';document.querySelector('#passwordMessage').remove();form.after(message);
 }catch(error){message.textContent=error.message;}finally{button.disabled=false;}
});
