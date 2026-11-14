const S=require('../lib/residential-server.cjs'),D=require('../lib/city-demand.cjs');
module.exports=async(req,res)=>{
 if(req.method!=='POST')return S.json(res,405,{error:'Method not allowed.'});
 try{
  const input=await S.body(req),db=S.database();
  if(input.action==='request'){await S.rate(db,req,'city-demand');return S.json(res,200,await D.save(db,input));}
  await S.admin(db,req);
  if(input.action==='summary')return S.json(res,200,{cities:S.checked(await db.rpc('city_demand_summary'))});
  if(input.action==='list'){
   const page=Math.max(1,Math.min(100000,Math.floor(Number(input.page)||1)));
   let q=db.from('city_demand_requests').select('id,name,email,city,state,zip,service,frequency,notify_launch,source,utm_source,utm_medium,utm_campaign,created_at',{count:'exact'}).order('created_at',{ascending:false}).order('id');
   if(input.city_key)q=q.eq('city_key',String(input.city_key).slice(0,100));if(input.state)q=q.eq('state',String(input.state).slice(0,2));if(input.zip)q=q.eq('zip',String(input.zip).slice(0,5));
   const r=await q.range((page-1)*100,page*100-1);S.checked(r);return S.json(res,200,{requests:r.data,total:r.count,page});
  }
  throw S.fail('Unknown demand action.');
 }catch(e){return S.json(res,e.status||400,{error:e.message||'Unable to process the city request.'});}
};
