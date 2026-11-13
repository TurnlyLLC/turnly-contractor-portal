const {test}=require('node:test');
const assert=require('node:assert/strict');
const {backendOrigin,fetchDocument}=require('../lib/mobile-backend.cjs');
test('existing portals keep the old backend until explicit configuration changes',()=>{
 assert.equal(backendOrigin({}),'https://turnly-contractor-app-backend.rork.app');
 assert.equal(backendOrigin({TURNLY_MOBILE_BACKEND_URL:'https://owned.example.test/'}),'https://owned.example.test');
 for(const url of ['http://owned.test','https://u:p@owned.test','https://owned.test/path','https://x.rork.app'])assert.throws(()=>backendOrigin({TURNLY_MOBILE_BACKEND_URL:url}));
});
test('file downloads follow only one verified private-storage redirect without login headers',async()=>{
 const env={TURNLY_MOBILE_BACKEND_URL:'https://owned.test',SUPABASE_URL:'https://preview.supabase.co',TURNLY_MOBILE_STORAGE_BUCKET:'turnly-migration-documents'};
 let calls=0;const destination=env.SUPABASE_URL+'/storage/v1/object/sign/turnly-migration-documents/documents/file_1?token=test';
 const transport=async(url,options)=>{calls++;assert.equal(options.headers,undefined);return calls===1?new Response(null,{status:302,headers:{location:destination}}):new Response('file');};
 assert.equal(await (await fetchDocument('https://owned.test/onboarding/f/file_1',transport,env)).text(),'file');assert.equal(calls,2);
 for(const location of ['https://evil.test/file',env.SUPABASE_URL+'/storage/v1/object/public/anything','https://u:p@preview.supabase.co/storage/v1/object/sign/turnly-migration-documents/documents/file_1'])await assert.rejects(fetchDocument('https://owned.test/onboarding/f/file_1',async()=>new Response(null,{status:302,headers:{location}}),env));
});
