const {clean}=require('./agent-referrals.cjs');
function visitDetails(input){
 const fail=message=>Object.assign(new Error(message),{status:400});
 if(!['yes','no'].includes(input.pets))throw fail('Let us know whether you have pets.');
 if(!['driveway','street','guest','none'].includes(input.parking))throw fail('Choose a parking option.');
 if(!['resident','code','lockbox'].includes(input.access_method))throw fail('Choose how your cleaner will enter.');
 const parking_instructions=input.parking==='guest'?clean(input.parking_instructions,600):'';
 if(input.parking==='guest'&&!parking_instructions)throw fail('Add guest parking instructions.');
 const pet_details=input.pets==='yes'?clean(input.pet_details,600):'';
 const access_code=input.access_method==='code'?clean(input.access_code,120):'';
 const lockbox_code=input.access_method==='lockbox'?clean(input.lockbox_code,120):'';
 if(input.pets==='yes'&&!pet_details)throw fail('Add a few details about your pets.');
 if(input.access_method==='code'&&!access_code)throw fail('Enter the property access code.');
 if(input.access_method==='lockbox'&&!lockbox_code)throw fail('Enter the lockbox code.');
 return {pets:input.pets,pet_details,parking:input.parking,parking_instructions,access_method:input.access_method,access_code,lockbox_code};
}
module.exports={visitDetails};
