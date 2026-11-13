const LEGACY='https://turnly-contractor-app-backend.rork.app';
function backendOrigin(env=process.env){
 if(!env.TURNLY_MOBILE_BACKEND_URL)return LEGACY;
 const u=new URL(env.TURNLY_MOBILE_BACKEND_URL);
 if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash||['rork.app','rork.com','rork.ai'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw Error('Invalid independent mobile backend origin');
 return u.origin;
}
async function fetchDocument(url,transport=fetch,env=process.env){
 const source=new URL(url),origin=backendOrigin(env);
 if(source.origin!==origin||!source.pathname.startsWith('/onboarding/f/'))throw Error('Invalid document source');
 const options={redirect:'manual',signal:AbortSignal.timeout(30000)};
 let response=await transport(source.href,options);
 if([301,302,303,307,308].includes(response.status)){
  // Only one redirect, to this project's explicitly configured private bucket.
  // No session/Authorization header is ever forwarded to a signed file URL.
  const target=new URL(response.headers.get('location')||'',source);
  const storage=env.SUPABASE_URL?new URL(env.SUPABASE_URL):null,bucket=env.TURNLY_MOBILE_STORAGE_BUCKET;
  if(!storage||!bucket||!/^turnly-migration-[a-z0-9-]+$/.test(bucket)||target.protocol!=='https:'||target.username||target.password||target.origin!==storage.origin||!target.pathname.startsWith('/storage/v1/object/sign/'+bucket+'/documents/'))throw Error('Unexpected document redirect');
  response=await transport(target.href,{...options,redirect:'error'});
 }
 return response;
}
module.exports={backendOrigin,fetchDocument};
