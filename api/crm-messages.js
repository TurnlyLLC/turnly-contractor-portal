const {createClient}=require('@supabase/supabase-js');
const S=require('../lib/residential-server.cjs'),C=require('../lib/crm-sales.cjs');
const {uuid}=require('../lib/agent-referrals.cjs');
const checked=r=>{if(r.error)throw S.fail('Messages could not be loaded or saved. Please try again.',503);return r.data;};
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  const db=S.database(),user=await C.access(db,req),i=await S.body(req);
  // Use the caller's JWT for all conversation operations, preserving existing inbox RLS.
  const scoped=createClient(process.env.SUPABASE_URL||'https://nwnzdoveskthebfyndcs.supabase.co',process.env.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:req.headers.authorization}}});
  if(i.action==='list'||i.action==='unread'){
   const rows=checked(await scoped.from('message_thread_participants').select('thread_id,last_read_at,message_threads(id,subject,last_message_at,last_message_preview,created_by_name)').eq('user_id',user.id).eq('is_archived',false));
   const threads=rows.filter(r=>r.message_threads).map(r=>({...r.message_threads,unread:!r.last_read_at||r.message_threads.last_message_at>r.last_read_at})).sort((a,b)=>String(b.last_message_at).localeCompare(String(a.last_message_at)));
   if(i.action==='unread')return S.json(res,200,{unread:threads.filter(t=>t.unread).length,user_id:user.id,conversations:threads.map(t=>({id:t.id,subject:t.subject,at:t.last_message_at,unread:t.unread}))});
   const people=checked(await db.from('profiles').select('id,full_name,role').in('role',['admin','sales','sales_team']).eq('status','active').neq('id',user.id));
   return S.json(res,200,{threads,people,user_id:user.id});
  }
  if(i.action==='create'){
   const body=String(i.body||'').trim(),subject=String(i.subject||'').trim();
   if(!body||body.length>5000||!subject||subject.length>160)throw S.fail('Enter a subject and a message (up to 5,000 characters).');
   let recipients=checked(await db.from('profiles').select('id,role').in('role',['admin','sales','sales_team']).eq('status','active').neq('id',user.id));
   recipients=recipients.filter(p=>i.recipient==='admin'?p.role==='admin':uuid(i.recipient)&&p.id===i.recipient);
   if(!recipients.length)throw S.fail('Choose an available recipient.');
   await S.rate(db,req,'crm-message:'+user.id);
   const id=checked(await scoped.rpc('create_message_thread_v2',{message_payload:{recipient_ids:recipients.map(p=>p.id),subject,body,related_type:'sales',related_title:'Sales team'}}));
   return S.json(res,200,{id});
  }
  if(!uuid(i.thread))throw S.fail('Choose a conversation.');
  const member=checked(await scoped.from('message_thread_participants').select('thread_id').eq('thread_id',i.thread).eq('user_id',user.id).eq('is_archived',false).maybeSingle());
  if(!member)throw S.fail('Conversation unavailable.',403);
  if(i.action==='read'){
   const readAt=new Date().toISOString();
   const messages=checked(await scoped.from('message_thread_messages').select('id,sender_id,sender_name,body,created_at').eq('thread_id',i.thread).order('created_at',{ascending:false}).limit(200)).reverse();
   checked(await scoped.from('message_thread_participants').update({last_read_at:readAt}).eq('thread_id',i.thread).eq('user_id',user.id));
   return S.json(res,200,{messages});
  }
  if(i.action==='reply'){
   const body=String(i.body||'').trim();if(!body||body.length>5000)throw S.fail('Enter a message up to 5,000 characters.');
   await S.rate(db,req,'crm-message:'+user.id);
   checked(await scoped.rpc('send_message_reply_v2',{message_payload:{thread_id:i.thread,body}}));
   return S.json(res,200,{ok:true});
  }
  throw S.fail('Unknown messaging action.');
 }catch(e){return S.json(res,e.status||503,{error:e.status?e.message:'Messaging is temporarily unavailable.'});}
};
