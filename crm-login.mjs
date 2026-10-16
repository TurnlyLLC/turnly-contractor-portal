import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
const env=window.__ENV||{},form=document.querySelector('#crmLogin'),message=document.querySelector('#loginMessage'),button=document.querySelector('#signIn');
const client=env.SUPABASE_URL&&env.SUPABASE_ANON_KEY?createClient(env.SUPABASE_URL,env.SUPABASE_ANON_KEY):null;
form.addEventListener('submit',async event=>{
 event.preventDefault();button.disabled=true;message.textContent='';
 try{
  if(!client)throw new Error('The workspace is temporarily unavailable. Please contact your administrator.');
  const {data,error}=await client.auth.signInWithPassword({email:form.email.value.trim(),password:form.password.value});
  if(error||!data?.user)throw new Error('Unable to sign in. Check your email and password and try again.');
  const result=await client.from('profiles').select('role,status').eq('id',data.user.id).maybeSingle();
  if(result.error||!result.data||!['admin','sales','sales_team'].includes(String(result.data.role).toLowerCase())||['inactive','disabled','suspended','rejected'].includes(String(result.data.status).toLowerCase())){
   await client.auth.signOut();throw new Error('This account does not have active CRM access. Contact your administrator.');
  }
  location.assign('sales.html');
 }catch(error){message.textContent=error.message;}finally{button.disabled=false;}
});
