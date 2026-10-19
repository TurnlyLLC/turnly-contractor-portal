import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
const env=window.__ENV||{},form=document.querySelector('#crmLogin'),message=document.querySelector('#loginMessage'),button=document.querySelector('#signIn');
const client=env.SUPABASE_URL&&env.SUPABASE_ANON_KEY?createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY):null;
form.addEventListener('submit',async event=>{
 event.preventDefault();button.disabled=true;message.textContent='';
 try{
  if(!client)throw new Error('The workspace is temporarily unavailable. Please contact your administrator.');
  const response=await fetch('/api/ambassadors',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',email:form.email.value.trim(),password:form.password.value})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to sign in.');
  const {error}=await client.auth.setSession(result.session);if(error)throw error;
  form.password.value='';location.assign(result.must_change_password?'ba.html?reset=1':'ba.html');
 }catch(error){message.textContent=error.message;}finally{button.disabled=false;}
});
