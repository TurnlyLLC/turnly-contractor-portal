const S=require('../lib/residential-server.cjs'),M=require('../lib/map-data.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  const input=await S.body(req),db=S.database();
  if(!['sales','cleans'].includes(input.dataset))throw S.fail('Choose a map.');
  if(input.dataset==='sales'){const user=await require('../lib/crm-sales.cjs').access(db,req);if(!user.admin)throw S.fail('Administrator access required.',403);}else await S.admin(db,req);
  if(!['list','locate','request_detail'].includes(input.action))throw S.fail('Unknown map action.');
  if(input.action==='request_detail'){
   if(input.dataset!=='cleans')throw S.fail('Request not available.',403);
   const row=S.checked(await db.from('out_of_area_requests').select('id,name,email,phone,property_address,city,state,zip,beds,baths,sqft,service,frequency,preferred_date,notes,created_at').eq('id',input.id).single());return S.json(res,200,{request:row});
  }
  const rows=await M.records(db,input.dataset);
  if(input.action==='list')return S.json(res,200,{records:await M.attach(db,rows),updated_at:new Date().toISOString()});
  await S.rate(db,req,'map-locate');
  if(!Array.isArray(input.ids)||input.ids.length>12)throw S.fail('Locate up to 12 records at a time.');
  const selected=rows.filter(r=>input.ids.includes(r.kind+':'+r.id));
  const attached=await M.attach(db,selected);
  return S.json(res,200,{...await M.geocode(db,attached.filter(r=>r.location_status==='not_located')),records:await M.attach(db,selected)});
 }catch(e){return S.json(res,e.status||400,{error:e.message||'Unable to load this map.'});}
};
