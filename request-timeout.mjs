export async function fetchWithTimeout(url,options={},timeoutMs=15000,transport=fetch){
 const controller=new AbortController(),original=options.signal;
 const abort=()=>controller.abort(original.reason);
 if(original?.aborted)abort();else original?.addEventListener('abort',abort,{once:true});
 let expired=false;
 const timer=setTimeout(()=>{expired=true;controller.abort();},timeoutMs);
 try{return await transport(url,{...options,signal:controller.signal});}
 catch(error){if(expired)throw Error('Turnly is taking too long to respond. Please wait a moment and try again.');throw error;}
 finally{clearTimeout(timer);original?.removeEventListener('abort',abort);}
}
