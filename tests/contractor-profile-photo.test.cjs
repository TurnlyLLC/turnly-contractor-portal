const {test}=require('node:test');
const assert=require('node:assert/strict');
const userId='12345678-1234-4234-9234-123456789abc';
function harness({identity=userId,uploadError=false,saveError=false,emptyProfile=false}={}){
 const calls=[];
 const storage={
  async upload(path,blob,options){calls.push(['upload',path,blob.type,options]);return {error:uploadError?{}:null};},
  getPublicUrl(path){return {data:{publicUrl:'https://project.supabase.co/storage/v1/object/public/profile-avatars/'+path}};},
  async remove(paths){calls.push(['remove',paths]);return {error:null};}
 };
 const client={auth:{getUser:async()=>({data:{user:{id:identity}}})},storage:{from(bucket){assert.equal(bucket,'profile-avatars');return storage;}},from(table){assert.equal(table,'profiles');return {update(values){calls.push(['update',values]);return {eq(field,value){calls.push(['filter',field,value]);return {single:async()=>({data:emptyProfile?null:values,error:saveError?{}:null}),select(){return this;}};}};}};}};
 return {calls,client};
}
test('file checks reject empty, oversized, and executable/vector input',async()=>{
 const {validatePhoto}=await import('../contractor-profile-photo.mjs');
 for(const file of [{type:'image/svg+xml',size:10},{type:'text/html',size:10},{type:'image/png',size:0},{type:'image/jpeg',size:21*1024*1024}])assert.throws(()=>validatePhoto(file));
 for(const type of ['image/jpeg','image/png','image/webp','image/heic'])assert.doesNotThrow(()=>validatePhoto({type,size:2000}));
});
test('upload is bound to the signed-in owner and profile saves before old-file cleanup',async()=>{
 const {saveProfilePhoto}=await import('../contractor-profile-photo.mjs'),h=harness();
 const saved=await saveProfilePhoto(h.client,userId,new Blob(['jpeg'],{type:'image/jpeg'}),userId+'/old.jpg');
 assert.ok(saved.avatar_path.startsWith(userId+'/'));assert.match(saved.avatar_path,/\.jpg$/);
 assert.deepEqual(h.calls.map(x=>x[0]),['upload','update','filter','remove']);
 assert.deepEqual(h.calls[2],['filter','id',userId]);assert.equal(h.calls[0][3].upsert,false);
 assert.deepEqual(h.calls[3][1],[userId+'/old.jpg']);
});
test('mismatched session and invalid output cannot upload or change any profile',async()=>{
 const {saveProfilePhoto}=await import('../contractor-profile-photo.mjs');
 for(const [identity,blob] of [['different-user',new Blob(['jpeg'],{type:'image/jpeg'})],[userId,new Blob(['svg'],{type:'image/svg+xml'})]]){
  const h=harness({identity});await assert.rejects(saveProfilePhoto(h.client,userId,blob));assert.equal(h.calls.length,0);
 }
});
test('failed profile update removes only the new upload and preserves previous photo',async()=>{
 const {saveProfilePhoto}=await import('../contractor-profile-photo.mjs');
 for(const options of [{saveError:true},{emptyProfile:true}]){
  const h=harness(options);await assert.rejects(saveProfilePhoto(h.client,userId,new Blob(['jpeg'],{type:'image/jpeg'}),userId+'/old.jpg'),/previous photo is unchanged/);
  assert.deepEqual(h.calls.at(-1),['remove',[h.calls[0][1]]]);
 }
 const h=harness({uploadError:true});await assert.rejects(saveProfilePhoto(h.client,userId,new Blob(['jpeg'],{type:'image/jpeg'})));assert.deepEqual(h.calls.map(x=>x[0]),['upload']);
});
test('cleanup never removes a file owned by another account',async()=>{
 const {saveProfilePhoto}=await import('../contractor-profile-photo.mjs'),h=harness();
 await saveProfilePhoto(h.client,userId,new Blob(['jpeg'],{type:'image/jpeg'}),'other-user/photo.jpg');
 assert.equal(h.calls.filter(x=>x[0]==='remove').length,0);
});
