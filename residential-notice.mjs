export const NOTICE_MS=36*60*60*1000;
export const easternDay=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function earliestDay(now=Date.now()){return easternDay(new Date(now+NOTICE_MS));}
export function arrivalInstant(day,time){
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 for(const offset of ['-04:00','-05:00']){
  const d=new Date(`${day}T${time}:00${offset}`);if(!Number.isFinite(+d))continue;
  const p=Object.fromEntries(formatter.formatToParts(d).map(p=>[p.type,p.value]));
  if(`${p.year}-${p.month}-${p.day}`===day&&`${p.hour}:${p.minute}`===time)return +d;
 }
 return NaN;
}
export function hasNotice(day,time,now=Date.now()){return arrivalInstant(day,time)>=now+NOTICE_MS;}
