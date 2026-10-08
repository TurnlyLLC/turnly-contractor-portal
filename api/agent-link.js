const {referralCodeFromSlug,ORIGIN}=require('../lib/agent-referrals.cjs');
module.exports=(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end();}
  const slug=new URL(req.url,ORIGIN).searchParams.get('slug');
  const code=referralCodeFromSlug(slug);
  res.setHeader('Cache-Control','no-store');
  if(!code){res.statusCode=404;return res.end('This booking link is invalid. Ask your agent for their complete Turnly link.');}
  res.statusCode=302;res.setHeader('Location',`${ORIGIN}/residential-referral.html?ref=${code}`);res.end();
};
