import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/+esm';

const element=id=>document.getElementById(id);
const frame=element('atlas');
const client=createClient(window.__ENV.SUPABASE_URL,window.__ENV.SUPABASE_ANON_KEY);
const table=()=>client.from('business_atlas');
let atlas;
let catalog;
let selected;
let editing;

function applyEdits(){
  frame.contentWindow.postMessage({action:'apply',edits:atlas.edits},'*');
}
window.addEventListener('message',event=>{
  if(event.source!==frame.contentWindow || event.origin!=='null' || !atlas)return;
  if(event.data?.action==='ready')applyEdits();
  if(event.data?.action==='current'){
    selected=event.data.id;
    catalog=new Map(event.data.nodes);
    element('edit').disabled=false;
  }
});

function addConnection(label='',target='home'){
  const row=document.createElement('div');
  const input=document.createElement('input');
  input.required=true;input.placeholder='Action label';input.value=label;
  input.setAttribute('aria-label','Action label');
  const select=document.createElement('select');
  select.setAttribute('aria-label','Destination');
  for(const [id,node] of catalog)select.add(new Option(node.title,id));
  select.value=String(target);
  const remove=document.createElement('button');
  remove.type='button';remove.textContent='Remove';remove.onclick=()=>row.remove();
  row.append(input,select,remove);element('edges').append(row);
}
element('edit').onclick=()=>{
  editing=selected;
  const node=catalog.get(editing);
  for(const key of ['title','description','url'])element(key).value=node[key];
  element('edges').replaceChildren();
  node.choices.forEach(([label,id])=>addConnection(label,id));
  element('notice').textContent='';
  element('editor').showModal();
};
element('add').onclick=()=>addConnection();
element('cancel').onclick=()=>element('editor').close();
element('form').onsubmit=async event=>{
  event.preventDefault();
  const title=element('title').value.trim();
  const url=element('url').value.trim();
  if(!title || (url && !/^https?:\/\//i.test(url))){
    element('notice').textContent='Enter a name and use an http or https link.';return;
  }
  const choices=[...element('edges').children].map(row=>[row.querySelector('input').value.trim(),row.querySelector('select').value]);
  const edits={...atlas.edits,[editing]:{title,url,description:element('description').value,choices}};
  element('save').disabled=true;
  try{
    const {data,error}=await table().update({edits,revision:atlas.revision+1}).eq('id',1).eq('revision',atlas.revision).select('revision').maybeSingle();
    if(error)throw error;
    if(!data)throw Error('The atlas changed in another session. Reload before saving your edits.');
    atlas.edits=edits;atlas.revision=data.revision;applyEdits();element('editor').close();
    element('status').textContent='Changes saved for all admins.';
  }catch(error){element('notice').textContent=error.message;}
  finally{element('save').disabled=false;}
};

try{
  const {data:{session}}=await client.auth.getSession();
  if(!session)throw Error('Sign in through the admin portal to open the atlas.');
  const {data,error}=await table().select('template,edits,revision').eq('id',1).maybeSingle();
  if(error)throw error;
  if(!data)throw Error('An admin account is required to view the atlas.');
  atlas=data;frame.srcdoc=data.template;element('status').textContent='';
}catch(error){element('status').textContent=error.message;}

