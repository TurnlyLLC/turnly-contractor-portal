const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const D=require('../lib/integration-documents.cjs'),M=require('../api/turnly-mcp.js'),C=require('../lib/integration-catalog.cjs');
const actor=crypto.randomUUID(),key=crypto.randomUUID(),profileId=crypto.randomUUID();
const bytes=Buffer.from('%PDF-1.7\nTest document\n%%EOF');
const spec={profile_id:profileId,file_name:'check.pdf',content_type:'application/pdf',file_size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),document_type:'background_check'};
process.env.CRON_SECRET='test-only-document-ticket-secret';
function fixture(){
 const rows=new Map(),events=[],state={bytes,uploaded:false,profile:{id:profileId,role:'contractor',full_name:'Test',email:'test@example.invalid',status:'active'}};
 const db={from(table){let id,row;return {select(){return this},eq(k,v){id=v;return this},async maybeSingle(){return {data:table==='profiles'?state.profile:rows.get(id)||null}},insert(value){assert.equal(table,'contractor_documents');row=value;return this},async single(){if(rows.has(row.id))return {error:{code:'23505'}};rows.set(row.id,row);events.push('insert');return {data:row}}}},storage:{from(bucket){assert.equal(bucket,'contractor-documents');return {async createSignedUploadUrl(path,options){assert.equal(options.upsert,false);state.path=path;events.push('sign');return {data:{signedUrl:'https://storage.example.invalid/'+path}}},async list(){return {data:state.uploaded?[{name:state.path.split('/').pop(),metadata:{size:state.bytes.length}}]:[]}},async download(){events.push('download');return {data:new Blob([state.bytes])}}}}}};
 return {db,state,rows,events};
}
test('upload permissions are distinct from reads and automatically included in Full access',()=>{
 assert(!M.definitions(['documents:read']).some(t=>t.name.includes('upload')));
 for(const scopes of [['documents:upload'],['platform:full']])assert(M.definitions(scopes).some(t=>t.name==='turnly_documents_upload_complete'));
 assert(C.catalog().resources.documents.filter_fields.includes('profile_id'));
 assert.throws(()=>D.validate({...spec,status:'approved'}),/cannot approve/);
 assert.throws(()=>D.validate({...spec,file_size:D.MAX+1}),/20 MB/);
 assert.throws(()=>D.validate({...spec,file_name:'../report.pdf'}),/without a path/);
 assert.throws(()=>D.validate({...spec,expiration_date:'2026-02-30'}),/valid/);
 assert.throws(()=>D.validate({...spec,content_type:'text/html'}),/PDF/);
});
test('upload verifies bytes, attaches to contractor, preserves approval, and deduplicates across requests',async()=>{
 const f=fixture();const start=await D.run(f.db,actor,key,'upload_start',spec);
 assert.equal(f.rows.size,0);assert.equal(start.method,'PUT');f.state.uploaded=true;
 const result=await D.run(f.db,actor,key,'upload_complete',{upload_ticket:start.upload_ticket});
 assert.equal(result.document.profile_id,profileId);assert.equal(result.document.status,'uploaded');assert.equal(result.checklist_changed,false);
 assert.equal([...f.rows.values()][0].metadata.sha256,spec.sha256);
 assert.equal((await D.run(f.db,actor,key,'upload_complete',{upload_ticket:start.upload_ticket})).duplicate,true);
 assert.equal((await D.run(f.db,actor,key,'upload_start',spec)).duplicate,true);assert.equal(f.rows.size,1);assert.equal(f.events.filter(x=>x==='download').length,1);
});
test('wrong connection, tampered or expired tickets and invalid files cannot attach records',async()=>{
 const f=fixture(),start=await D.run(f.db,actor,key,'upload_start',spec),input={upload_ticket:start.upload_ticket};
 await assert.rejects(D.run(f.db,actor,crypto.randomUUID(),'upload_complete',input),/different connection/);
 await assert.rejects(D.run(f.db,crypto.randomUUID(),key,'upload_complete',input),/different connection/);
 await assert.rejects(D.run(f.db,actor,key,'upload_complete',{upload_ticket:'x'+start.upload_ticket}),/Invalid/);
 const decoded=D.verify(start.upload_ticket,actor,key);assert.throws(()=>D.verify(D.sign({...decoded,expires:Date.now()-1000}),actor,key),/expired/);
 await assert.rejects(D.run(f.db,actor,key,'upload_complete',input),/not uploaded/);
 f.state.uploaded=true;f.state.bytes=Buffer.alloc(bytes.length,1);
 await assert.rejects(D.run(f.db,actor,key,'upload_complete',input),/checksum/);assert.equal(f.rows.size,0);
 f.state.bytes=Buffer.from('x');await assert.rejects(D.run(f.db,actor,key,'upload_complete',input),/size/);
 f.state.profile={id:profileId,role:'customer'};await assert.rejects(D.run(f.db,actor,key,'upload_start',spec),/not found/);
});
test('format verification rejects disguised files',()=>{
 assert(D.signatureMatches(bytes,'application/pdf'));assert(!D.signatureMatches(Buffer.from('<html>'),'application/pdf'));
 assert(D.signatureMatches(Buffer.from('89504e470d0a1a0a','hex'),'image/png'));
 assert(D.signatureMatches(Buffer.from([255,216,255]),'image/jpeg'));
 assert(D.signatureMatches(Buffer.from('RIFF0000WEBP'),'image/webp'));
});
