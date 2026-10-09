// Opt-in deployment check. This recipient is Resend's delivery simulator;
// it never contacts an agent/customer and never changes referral status.
module.exports=async()=>{
 const key=String(process.env.RESEND_API_KEY||'').trim(),from=String(process.env.REFERRAL_FROM_EMAIL||'').trim();
 if(!key||!from)throw new Error('Email setup check: sender settings are missing.');
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:['delivered@resend.dev'],subject:'Turnly sender verification check',text:'Synthetic deployment check using the Resend delivery simulator.'}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error(`Email setup check rejected by provider (HTTP ${r.status}). Check the sender domain and API key in Resend.`);
 const result=await r.json();if(!result.id)throw new Error('Email setup check returned no provider message ID.');
 console.log('EMAIL_SETUP_CHECK: Resend accepted the verified sender test to delivered@resend.dev.');
};
