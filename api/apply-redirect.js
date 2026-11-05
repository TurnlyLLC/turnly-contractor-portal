// Keep older recruiting links working, including their position/source parameters.
module.exports=(req,res)=>{
 const query=new URL(req.url,'https://portal.turnlypros.com').search;
 res.statusCode=308;
 res.setHeader('Location','https://turnlypros.com/apply.html'+query);
 res.setHeader('Cache-Control','public, max-age=300');
 res.end();
};
