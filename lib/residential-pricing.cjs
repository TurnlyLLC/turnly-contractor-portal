const SERVICES = {standard:'Standard clean',deep:'Deep clean',move:'Move-in / move-out clean',listing:'Listing / staging clean'};
const FREQUENCIES = {once:'One time',monthly:'Once a month',biweekly:'Every two weeks',weekly:'Weekly'};
const MAINTENANCE = {monthly:[12,16500],biweekly:[11,15000],weekly:[10,14000]};
function quote(input) {
  const service=String(input.service||''),frequency=String(input.frequency||'once'),sqft=Number(input.sqft);
  if(!SERVICES[service]||!FREQUENCIES[frequency])throw new Error('Choose a service and frequency.');
  if(!['standard','deep'].includes(service)&&frequency!=='once')throw new Error('Move and listing cleans are one-time services.');
  if(!Number.isInteger(sqft)||sqft<100||sqft>50000)throw new Error('Enter the finished square footage being cleaned, from 100 to 50,000.');
  const rate=service==='standard'?13:21,minimum=17500;
  const recurring=frequency==='once'?null:MAINTENANCE[frequency];
  return {version:'2026-10-08',service,service_label:SERVICES[service],frequency,frequency_label:FREQUENCIES[frequency],sqft,
    rate_cents:rate,minimum_cents:minimum,amount_cents:Math.max(sqft*rate,minimum),review_required:sqft>3000,
    maintenance_cents:recurring?Math.max(sqft*recurring[0],recurring[1]):null,maintenance_rate_cents:recurring?.[0]||null,
    maintenance_minimum_cents:recurring?.[1]||null};
}
function easternDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function schedule(input,now=new Date()) {
  const day=String(input.service_date||''),start=String(input.arrival_start||''),end=String(input.arrival_end||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day||day<=easternDate(now))throw new Error('Choose a service date starting tomorrow.');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||end<=start)throw new Error('Choose an arrival window with an end time after its start time.');
  // Charge at 6am Eastern, or at the beginning of an earlier requested window.
  const chargeTime=start<'06:00'?start:'06:00';
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const local=d=>Object.fromEntries(formatter.formatToParts(d).map(p=>[p.type,p.value]));
  // Validate each offset against the actual zone rules. On fall-back choose the first occurrence.
  function instant(time){for(const offset of ['-04:00','-05:00']){const d=new Date(`${day}T${time}:00${offset}`),p=local(d);if(`${p.year}-${p.month}-${p.day}`===day&&`${p.hour}:${p.minute}`===time)return d.getTime();}throw new Error('That time does not exist on this daylight-saving date. Please choose another arrival window.');}
  instant(start);instant(end);
  return {service_date:day,arrival_start:start,arrival_end:end,charge_at:instant(chargeTime)};
}
module.exports={SERVICES,FREQUENCIES,quote,schedule,easternDate};
