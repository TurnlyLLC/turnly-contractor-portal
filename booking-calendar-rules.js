(function(root){
 'use strict';
 const defaults={paused:false,first_date:'',notice_hours:36,horizon_days:180,weekdays:[0,1,2,3,4,5,6],blocked_dates:[],slots:[{start:'09:00',end:'12:00'},{start:'12:00',end:'15:00'},{start:'15:00',end:'18:00'}],allow_custom:true,open_time:'00:00',close_time:'23:59',min_window:1,max_window:1439,pause_message:'New cleaning bookings are temporarily paused. Please check back soon.'};
 const dateOK=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 const timeOK=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t);
 const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
 const day=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
 const add=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 function instant(d,t){const f=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});for(const offset of ['-04:00','-05:00']){const x=new Date(`${d}T${t}:00${offset}`);if(!Number.isFinite(+x))continue;const p=Object.fromEntries(f.formatToParts(x).map(p=>[p.type,p.value]));if(`${p.year}-${p.month}-${p.day}`===d&&`${p.hour}:${p.minute}`===t)return +x;}return NaN;}
 function normalize(input={}){const s={...defaults,...input};
  for(const [key,min,max] of [['notice_hours',0,8760],['horizon_days',1,730],['min_window',1,1439],['max_window',1,1439]])if(!Number.isInteger(s[key])||s[key]<min||s[key]>max)throw new Error(`Invalid ${key.replaceAll('_',' ')}.`);
  if(typeof s.paused!=='boolean'||typeof s.allow_custom!=='boolean')throw new Error('Choose valid booking switches.');
  if(s.first_date&&!dateOK(s.first_date))throw new Error('Choose a valid first service date.');
  if(!Array.isArray(s.weekdays)||!s.weekdays.length||s.weekdays.some(n=>!Number.isInteger(n)||n<0||n>6))throw new Error('Select at least one available weekday.');
  if(!Array.isArray(s.blocked_dates)||s.blocked_dates.length>730||s.blocked_dates.some(d=>!dateOK(d)))throw new Error('Enter valid blocked dates.');
  if(!timeOK(s.open_time)||!timeOK(s.close_time)||s.open_time>=s.close_time||s.min_window>s.max_window)throw new Error('Check operating hours and arrival-window lengths.');
  if(!Array.isArray(s.slots)||s.slots.length>96||(!s.slots.length&&!s.allow_custom))throw new Error('Add at least one time slot or allow custom arrival windows.');
  for(const x of s.slots)if(!timeOK(x.start)||!timeOK(x.end)||x.start>=x.end||x.start<s.open_time||x.end>s.close_time)throw new Error('Each slot must start before it ends, within operating hours.');
  const result={};for(const key of Object.keys(defaults))result[key]=s[key];
  result.pause_message=String(s.pause_message||defaults.pause_message).trim().slice(0,300);result.weekdays=[...new Set(s.weekdays)].sort();result.blocked_dates=[...new Set(s.blocked_dates)].sort();result.slots=s.slots.map(x=>({start:x.start,end:x.end})).filter((x,i,a)=>a.findIndex(y=>y.start===x.start&&y.end===x.end)===i).sort((a,b)=>a.start.localeCompare(b.start));return result;
 }
 function dateError(s,d,now=Date.now()){
  if(s.paused)return s.pause_message;
  if(!dateOK(d))return 'Choose a valid service date.';
  if(d<day(now)||s.first_date&&d<s.first_date)return 'Choose a date on or after '+(s.first_date>day(now)?s.first_date:day(now))+'.';
  if(d>add(day(now),s.horizon_days))return 'Choose a date within the next '+s.horizon_days+' days.';
  if(!s.weekdays.includes(new Date(d+'T12:00:00Z').getUTCDay())||s.blocked_dates.includes(d))return 'This date is not available. Please choose another day.';
  return '';
 }
 function error(s,d,start,end,now=Date.now()){
  const e=dateError(s,d,now);if(e)return e;
  if(!timeOK(start)||!timeOK(end)||end<=start)return 'Choose an arrival window with an end after its start.';
  if(!Number.isFinite(instant(d,start))||!Number.isFinite(instant(d,end)))return 'That time is unavailable on this daylight-saving date.';
  if(instant(d,start)<now+s.notice_hours*3600000)return `Choose a time at least ${s.notice_hours} hours in advance.`;
  if(start<s.open_time||end>s.close_time)return `Choose an arrival window between ${s.open_time} and ${s.close_time} Eastern.`;
  if(s.slots.some(x=>x.start===start&&x.end===end))return '';
  if(!s.allow_custom)return 'Choose one of the available time slots.';
  const length=minutes(end)-minutes(start);return length<s.min_window||length>s.max_window?`Choose an arrival range between ${s.min_window} and ${s.max_window} minutes.`:'';
 }
 function available(s,d,now=Date.now()){if(dateError(s,d,now))return false;if(s.slots.some(x=>!error(s,d,x.start,x.end,now)))return true;if(!s.allow_custom)return false;const last=minutes(s.close_time)-s.min_window;for(let m=last;m>=minutes(s.open_time)&&m>last-180;m--){const t=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');if(!error(s,d,t(m),t(m+s.min_window),now))return true;}return false;}
 function next(s,now=Date.now()){for(let d=s.first_date>day(now)?s.first_date:day(now),end=add(day(now),s.horizon_days);d<=end;d=add(d,1))if(available(s,d,now))return d;return null;}
 const api={defaults,normalize,day,add,instant,error,dateError,available,next};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TurnlyBookingCalendar=api;
})(globalThis);
