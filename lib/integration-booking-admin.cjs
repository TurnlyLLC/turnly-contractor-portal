const S=require('./residential-server.cjs');
async function run(db,actor,action,input){
 if(action==='reschedule'){try{require('./residential-pricing.cjs').schedule(input);}catch(e){throw S.fail(e.message);}}
 if(action==='create_assignment'){
  const valid=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
  if(!valid(input.start_window)||!valid(input.end_window)||Date.parse(input.end_window)<=Date.parse(input.start_window)||typeof input.pay_amount!=='number'||!Number.isFinite(input.pay_amount)||input.pay_amount<0||Math.abs(input.pay_amount*100-Math.round(input.pay_amount*100))>.00001)throw S.fail('Provide valid offset-aware times and nonnegative dollar pay with at most two decimals.');
 }
 const r=await db.rpc('integration_booking_admin',{p_actor:actor,p_operation:action,p_input:input});
 if(r.error)throw S.fail(r.error.code==='P0001'?r.error.message:'Booking change failed; refresh before retrying.',409);
 return r.data;
}
module.exports={run};
