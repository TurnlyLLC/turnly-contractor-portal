// CSV parser supports quoted commas, escaped quotes, and multiline notes.
export function parseAgentCsv(text){
  text=String(text).replace(/^\uFEFF/,'');
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||!field){quoted=!quoted;}else throw new Error('Unexpected quote in CSV.');}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('An opening quote has no closing quote.');
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2)throw new Error('The file needs headers and at least one agent.');
  const aliases={agent_name:'name',full_name:'name',first_name:'first_name',last_name:'last_name',company:'brokerage',company_name:'brokerage',email_1:'email',email_address:'email',phone_number:'phone',mobile:'phone'};
  const headers=rows.shift().map(h=>h.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'' )).map(h=>aliases[h]||h);
  if(!headers.includes('name')&&!(headers.includes('first_name')&&headers.includes('last_name')))throw new Error('Include a Name column, or First Name and Last Name.');
  if(!headers.includes('email')&&!headers.includes('phone'))throw new Error('Include an Email or Phone column.');
  if(rows.length>500)throw new Error('Import up to 500 agents per file.');
  return rows.map((values,i)=>{if(values.length!==headers.length)throw new Error(`Row ${i+2} has a different number of columns than the header.`);const item=Object.fromEntries(headers.map((h,j)=>[h,values[j].trim()]));return {source_key:'',...Object.fromEntries(['city','address','state','website','postal_code','phone_1','phone_2','phone_3','email_2','email_3','email_1_phone','email_2_phone','email_3_phone'].map(k=>[k,item[k]||''])),name:item.name||[item.first_name,item.last_name].filter(Boolean).join(' '),brokerage:item.brokerage||'',email:item.email||'',phone:item.phone||'',notes:item.notes||'',follow_up_on:item.follow_up_on||null};});
}
