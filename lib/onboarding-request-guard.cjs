const {createHash}=require('node:crypto');

// Per warm function instance, not a distributed rate limit. Never cache identity,
// approval decisions, documents, or tokens. Accepted requests still authenticate.
function createGuard({now=Date.now,capacity=6,refillMs=10000,maxEntries=2048}={}){
 const buckets=new Map();
 return function check(token){
  if(!token)return;
  const time=now(),key=createHash('sha256').update(token).digest('hex');
  let bucket=buckets.get(key);
  if(!bucket){
   for(const [id,b] of buckets)if(time-b.updated>=capacity*refillMs)buckets.delete(id);
   if(buckets.size>=maxEntries)throw limited(capacity*refillMs/1000);
   bucket={tokens:capacity,updated:time};buckets.set(key,bucket);
  }
  bucket.tokens=Math.min(capacity,bucket.tokens+Math.max(0,time-bucket.updated)/refillMs);
  bucket.updated=time;
  if(bucket.tokens<1)throw limited(Math.ceil((1-bucket.tokens)*refillMs/1000));
  bucket.tokens--;
 };
}
function limited(seconds){return Object.assign(Error('Status was checked too often. Wait a few seconds, then refresh once.'),{status:429,retryAfter:seconds});}
module.exports={createGuard};
