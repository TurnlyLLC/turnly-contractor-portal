import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';
const client=createClient(window.__ENV.SUPABASE_URL,window.__ENV.SUPABASE_ANON_KEY);
document.querySelector('form').onsubmit=async e=>{
 e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
 const files=[...document.querySelector('#files').files];let done=0,failed=0;
 document.querySelector('#errors').textContent='';
 for(const file of files){try{
  const {data:{session}}=await client.auth.getSession();if(!session)throw Error('Sign in to the admin portal first.');
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(file);});
  const response=await fetch('/api/applicant-resume-import',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({data}),signal:AbortSignal.timeout(60000)});
  const result=await response.json();if(!response.ok)throw Error(result.error);done++;
 }catch(err){failed++;document.querySelector('#errors').textContent+=file.name+': '+err.message+'\n';}
 document.querySelector('#status').textContent=`${done} attached or already attached; ${failed} errors; ${files.length-done-failed} remaining.`;
 }button.disabled=false;
};
