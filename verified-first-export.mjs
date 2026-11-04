const massFileHeaders = ['*First Name', '*Last Name', '*Email Address', 'Phone', 'Cost Code 1', '*Job State'];
function invitePhone(value) {
  const phone = String(value ?? '').trim();
  if (!/^[+\d\s().-]+$/.test(phone)) return '';
  const digits = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (digits.length !== 10) return '';
  return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
}
const fields = {
  'Full Name': a => a.name,
  'First Name': a => a.first_name || a.name.trim().split(/\s+/)[0],
  'Last Name': a => a.last_name || a.name.trim().split(/\s+/).slice(1).join(' '),
  'Email Address': a => a.email,
  'Phone Number': a => invitePhone(a.phone),
  'Street Address': a => a.street,
  City: a => a.city,
  State: a => a.state,
  'ZIP Code': a => a.zip,
  'Work State': () => 'NC',
  'Job State': () => 'North Carolina',
  'Cost Code 1': () => ''
};
const aliases = {firstname:'First Name',lastname:'Last Name',name:'Full Name',email:'Email Address',phone:'Phone Number',mobilephone:'Phone Number',cellphone:'Phone Number',address:'Street Address',address1:'Street Address',addressline1:'Street Address',zipcode:'ZIP Code',postalcode:'ZIP Code',zip:'ZIP Code',stateofemployment:'Work State'};
const normalize = name => name.toLowerCase().replace(/[^a-z0-9]/g,'');
const lookup = Object.fromEntries(Object.keys(fields).map(key=>[normalize(key),key]));
function field(header) {
  const key = normalize(header).replace(/^(candidate|applicant)/,'');
  return fields[aliases[key] || lookup[key]];
}
export function headersFromTemplate(text) {
  const line = text.replace(/^\uFEFF/,'').split(/\r?\n/)[0];
  const headers = [];
  let cell = '', quoted = false;
  for(let i=0;i<line.length;i++){
    if(line[i]==='"'){
      if(quoted && line[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
    }else if(line[i]===',' && !quoted){headers.push(cell);cell='';}else cell+=line[i];
  }
  headers.push(cell);
  if(quoted || !headers.some(h=>field(h)===fields['Email Address']))throw Error('Choose an Applicant Invite CSV template with an email column.');
  return headers;
}
function quote(value){
  let text=String(value??'').trim();
  if(/^[=+@-]/.test(text) && !/^\+\d[\d ().-]*$/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function exportBatch(rows,headers=massFileHeaders){
  return [headers,...rows.map(a=>headers.map(h=>field(h)?.(a)??''))].map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
}
export function downloadBatch(rows,headers){
  const url=URL.createObjectURL(new Blob([exportBatch(rows,headers)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='turnly-hired-cleaners-'+new Date().toISOString().slice(0,10)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
