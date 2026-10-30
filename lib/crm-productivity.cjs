const S=require('./residential-server.cjs');
const C=require('./crm-sales.cjs');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function sessionId(token){let id;try{id=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).session_id;}catch{}if(!uuid.test(id||''))throw S.fail('Sign in again.',401);return id;}
function union(intervals){const sorted=intervals.filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);const out=[];for(const [a,b] of sorted){const last=out.at(-1);if(last&&a<=last[1])last[1]=Math.max(b,last[1]);else out.push([a,b]);}return out;}
const seconds=intervals=>union(intervals).reduce((n,[a,b])=>n+(b-a)/1000,0);
const date=v=>new Date(v).getTime();
function summarize(user,plans,sessions,work,calls,start,end,now=Date.now()){
 const own=a=>a.filter(r=>r.user_id===user.id),ps=own(plans).sort((a,b)=>date(a.effective_at)-date(b.effective_at)),ss=own(sessions),cs=own(calls),ws=own(work);
 const clip=(a,b)=>[Math.max(start,a),Math.min(end,b,now)];
 const callRanges=cs.filter(c=>c.answered_at&&c.dialed_at).map(c=>clip(date(c.answered_at),c.ended_at?date(c.answered_at)+(c.duration_seconds||0)*1000:Math.min(now,date(c.created_at)+3660000)));
 const active=union([...ws.map(w=>clip(date(w.started_at),date(w.ended_at))),...callRanges]);
 let hourly=0,hourlySeconds=0;
 for(let i=0;i<ps.length;i++){const p=ps[i];if(p.mode!=='hourly')continue;const low=date(p.effective_at),high=ps[i+1]?date(ps[i+1].effective_at):end;
 const n=seconds(active.map(([a,b])=>[Math.max(a,low),Math.min(b,high)]));hourlySeconds+=n;hourly+=n*p.hourly_cents/3600;}
 const sessionEnd=s=>{const lastCall=cs.filter(c=>c.session_id===s.session_id).reduce((n,c)=>Math.max(n,c.ended_at?date(c.ended_at):c.dialed_at&&['dialing','initiated','ringing','in-progress'].includes(c.status)?Math.min(now,date(c.created_at)+3660000):0),0);return s.ended_at?date(s.ended_at):Math.min(now,Math.max(date(s.last_activity_at),lastCall)+300000);};
 const logged=seconds(ss.map(s=>clip(date(s.started_at),sessionEnd(s))));
 const attempted=cs.filter(c=>c.call_sid&&date(c.dialed_at||c.created_at)>=start&&date(c.dialed_at||c.created_at)<end).sort((a,b)=>date(a.dialed_at||a.created_at)-date(b.dialed_at||b.created_at));
 const completed=attempted.filter(c=>c.status==='completed'&&c.duration_seconds>0),gaps=[];
 for(let i=1;i<attempted.length;i++){const a=attempted[i-1],b=attempted[i];if(a.ended_at&&a.session_id===b.session_id){const gap=(date(b.dialed_at||b.created_at)-date(a.ended_at))/1000;if(gap>=0)gaps.push(gap);}}
 const current=ps.at(-1)||{mode:'commission',commission_bps:1000,hourly_cents:0};
 return {user_id:user.id,name:user.full_name||'Sales member',status:user.status,plan:current,logged_seconds:logged,active_seconds:seconds(active),hourly_seconds:hourlySeconds,hourly_cents:Math.round(hourly),calls:attempted.length,answered_calls:completed.length,average_call_seconds:completed.length?completed.reduce((n,c)=>n+c.duration_seconds,0)/completed.length:null,average_gap_seconds:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null,
 online:ss.some(s=>!s.ended_at&&date(s.last_seen_at)>now-45000&&date(s.last_activity_at)>now-300000),
 sessions:ss.map(s=>({started_at:s.started_at,ended_at:s.ended_at||new Date(sessionEnd(s)).toISOString(),reason:s.end_reason||(date(s.last_activity_at)<=now-300000?'inactive':'open')})).sort((a,b)=>date(b.started_at)-date(a.started_at)).slice(0,100)};
}
async function report(db,user,input){
 const start=date(input.from),end=date(input.to);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>94*86400000)throw S.fail('Choose a date range of up to 93 days.');
 const scope=q=>user.admin?q:q.eq('user_id',user.id);
 const [plans,sessions,work,calls,people]=await Promise.all([
 C.all(db,'crm_pay_plans','*',scope),
 C.all(db,'crm_activity_sessions','*',q=>scope(q).lt('started_at',new Date(end).toISOString()).gte('last_seen_at',new Date(start-3660000).toISOString()),'session_id'),
 C.all(db,'crm_work_intervals','*',q=>scope(q).lt('started_at',new Date(end).toISOString()).gt('ended_at',new Date(start).toISOString())),
 C.all(db,'crm_voice_calls','id,user_id,session_id,status,created_at,dialed_at,answered_at,ended_at,duration_seconds,call_sid',q=>scope(q).gte('created_at',new Date(start-3660000).toISOString()).lt('created_at',new Date(end).toISOString())),
 user.admin?C.all(db,'profiles','id,full_name,status',q=>q.in('role',['admin','sales','sales_team'])):[user]
 ]);
 return {admin:user.admin,from:new Date(start).toISOString(),to:new Date(end).toISOString(),rows:people.map(p=>summarize(p,plans,sessions,work,calls,start,end)),tracking_since:plans.length?plans.reduce((a,p)=>a<p.effective_at?a:p.effective_at,plans[0].effective_at):null};
}
function validatePlan(i){const mode=i.mode,bps=Number(i.commission_percent)*100,hourly=Number(i.hourly_rate)*100;
 if(!uuid.test(i.user_id||'')||!['commission','hourly'].includes(mode)||!Number.isInteger(Math.round(bps))||!Number.isFinite(bps)||bps<0||bps>10000||Math.abs(bps-Math.round(bps))>.00001||!Number.isFinite(hourly)||hourly<0||hourly>100000||Math.abs(hourly-Math.round(hourly))>.00001||mode==='hourly'&&hourly<=0)throw S.fail('Choose a member, a commission from 0–100%, or an hourly rate greater than $0 (up to $1,000).');
 return {p_user:i.user_id,p_mode:mode,p_bps:Math.round(bps),p_hourly:Math.round(hourly)};
}
module.exports={sessionId,summarize,union,seconds,report,validatePlan};
