const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(source){
 const handlers={},doc={},status={},retry={},video={isConnected:true,currentTime:0,duration:180,readyState:0,hidden:true,loads:0,addEventListener:(k,f)=>handlers[k]=f,pause(){this.paused=true;},load(){this.loads++;},querySelector:()=>({src:'https://turnly.example/lesson.mp4'})};
 const ctx={module:{exports:{}},document:{hidden:false,addEventListener:(k,f)=>doc[k]=f,removeEventListener:k=>delete doc[k]},setTimeout:()=>1,clearTimeout:()=>{},Date,Number,Error};vm.runInNewContext(fs.readFileSync('training-video.js','utf8'),ctx);
 let time=100000;const player=ctx.module.exports.mount(video,{source,status,retry,now:()=>time});return{video,status,retry,handlers,doc,player,setTime:t=>time=t};
}
const flush=()=>new Promise(r=>setImmediate(r));
test('private MP4 refresh preserves position and never starts playback automatically',async()=>{
 let calls=0;const f=setup(async()=>({url:'https://turnly.example/signed-'+(++calls),expiresAt:200000}));await flush();assert.equal(f.video.loads,1);assert.equal(f.video.hidden,false);
 f.video.currentTime=42;f.setTime(190000);f.handlers.play();await flush();assert.equal(calls,2);assert.equal(f.video.paused,true);f.handlers.loadedmetadata();assert.equal(f.video.currentTime,42);
});
test('failed signing exposes a working retry; detached lessons never receive a URL',async()=>{
 let fail=true;const f=setup(async()=>{if(fail)throw Error('expired session');return{url:'https://turnly.example/file.mp4'};});await flush();assert.equal(f.retry.hidden,false);fail=false;f.retry.onclick();await flush();assert.equal(f.video.loads,1);
 let resolve;const g=setup(()=>new Promise(r=>resolve=r));g.video.isConnected=false;resolve({url:'https://turnly.example/private'});await flush();assert.equal(g.video.loads,0);
});
test('media errors refresh once, then offer retry rather than loop',async()=>{
 let calls=0;const f=setup(async()=>({url:'https://turnly.example/'+(++calls)}));await flush();f.handlers.error();await flush();f.handlers.error();await flush();assert.equal(calls,2);assert.equal(f.retry.hidden,false);
});
test('static sales MP4 can be reloaded without touching training records',async()=>{
 const f=setup();f.video.currentTime=65;f.handlers.error();assert.equal(f.retry.hidden,false);f.retry.onclick();await flush();assert.equal(f.video.src,'https://turnly.example/lesson.mp4');f.handlers.loadedmetadata();assert.equal(f.video.currentTime,65);
});
test('all BA lessons and walkthroughs use stored MP4s, never third-party iframe fallback',()=>{
 const course=require('../lib/ba-training-course.json'),walk=require('../lib/ba-booking-walkthrough.json');for(const x of [...course.lessons,walk])assert.match(x.video_path,/\.mp4$/);
 assert.doesNotMatch(fs.readFileSync('ba-training.mjs','utf8'),/<iframe/);
 assert.match(fs.readFileSync('contractor-academy/index.html','utf8'),/training-video.js/);
});
