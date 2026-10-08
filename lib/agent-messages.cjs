const {referralUrl}=require('./agent-referrals.cjs');

// Preview and provider requests use the same content.
function referralMessages(agent,flyerUrl){
  return {
    subject:'Your Turnly referral flyer and signup link',
    email:`Hi ${agent.name},\n\nYour personalized Turnly flyer is attached. Share this signup link with your clients:\n${referralUrl(agent.referral_code)}\n\nReferral ID: ${agent.referral_code}\nYou earn 10% of the eligible cleaning subtotal on each referred customer's first completed and paid clean.\n\nTurnly`,
    sms:`Turnly: Your personalized flyer: ${flyerUrl}\nClient signup: ${referralUrl(agent.referral_code)}\nReply STOP to opt out.`
  };
}
module.exports={referralMessages};
