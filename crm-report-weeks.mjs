export const reportZone='America/New_York';
export function easternDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:reportZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function addDays(day,n){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function weekOf(day=easternDate()){const d=new Date(day+'T12:00:00Z');const from=addDays(day,-((d.getUTCDay()+6)%7));return {from,to:addDays(from,6)};}
export function midnight(day){
 const target=Date.parse(day+'T00:00:00Z');let value=target;
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:reportZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 for(let i=0;i<3;i++){const p=Object.fromEntries(fmt.formatToParts(new Date(value)).map(p=>[p.type,p.value]));value+=target-Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);}
 return new Date(value).toISOString();
}
export function reportRange(from,to){return {from:midnight(from),to:midnight(addDays(to,1))};}
