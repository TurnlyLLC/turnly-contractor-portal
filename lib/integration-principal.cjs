// Request-object identity is server-only: JSON and HTTP headers cannot forge it.
const principals=new WeakMap();
module.exports={bind(req,actor){principals.set(req,actor);},get(req){return principals.get(req);}};
