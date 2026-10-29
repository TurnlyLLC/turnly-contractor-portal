const S=require('./residential-server.cjs');
const cities=['Durham','Raleigh','Asheville','Greensboro'];
const zones=cities.map(city=>({id:'NC:'+city,state:'NC',city,label:city+' + surrounding 25-mile area'}));
function selected(p){const values=p.allowed_regions?.length?p.allowed_regions:[p.market,p.region];return zones.filter(z=>values.some(v=>[z.id.toLowerCase(),z.city.toLowerCase()].includes(String(v||'').trim().toLowerCase()))).map(z=>z.id);}
async function run(db,user,input={}){
 if(input.action&&!['board','preferences'].includes(input.action))throw S.fail('Unknown job-area action.');
 const p=S.checked(await db.from('profiles').select('id,role,status,allowed_regions,market,region').eq('id',user).maybeSingle());
 if(p?.role!=='contractor'||['deleted','deletion_pending','disabled','suspended','inactive','deactivated','rejected'].includes(p.status))throw S.fail('Sign in with an available contractor account.',403);
 if(input.zones!==undefined){
  if(!Array.isArray(input.zones)||!input.zones.length||input.zones.length>zones.length||input.zones.some(id=>!zones.some(z=>z.id===id)))throw S.fail('Select one or more available service areas.');
  p.allowed_regions=zones.filter(z=>input.zones.includes(z.id)).map(z=>z.city);
  S.checked(await db.from('profiles').update({allowed_regions:p.allowed_regions}).eq('id',user));
 }
 const result={zones,selected:selected(p),can_edit:true};
 if(input.action==='board')result.jobs=S.checked(await db.rpc('contractor_job_board',{p_actor:user}));
 else if(input.action&&input.action!=='preferences')throw S.fail('Unknown job-area action.');
 return result;
}
module.exports={zones,selected,run};
