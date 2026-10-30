(function(scope){
  'use strict';
  // Shared embedded playback. Only the signed URL is renewed; lesson completion is untouched.
  function mount(video,{source,status,retry,now=Date.now}={}){
    let busy=false,expires=Infinity,position=0,recoveries=0,timer;
    const say=text=>{if(status)status.textContent=text;};
    video.playsInline=true;video.preload='metadata';
    const ready=()=>{clearTimeout(timer);if(position>0&&Number.isFinite(video.duration))video.currentTime=Math.min(position,Math.max(0,video.duration-.1));position=0;say('Press Play to watch here. Sound and fullscreen are available in the player.');if(retry)retry.hidden=true;};
    const failed=()=>{clearTimeout(timer);say('Video could not load. Check your connection, then select Reload video. Your saved training progress is unchanged.');if(retry)retry.hidden=false;};
    async function reload(){
      if(busy||!video.isConnected)return;busy=true;position=video.currentTime||position;video.pause();
      say('Loading video…');if(retry)retry.hidden=true;
      try{
        const result=source?await source():{url:video.currentSrc||video.src||video.querySelector('source')?.src};
        if(!video.isConnected)return;
        if(!result?.url)throw Error('Missing video');
        expires=result.expiresAt||Infinity;video.src=result.url;video.hidden=false;video.load();
        clearTimeout(timer);timer=setTimeout(()=>{if(video.isConnected&&video.readyState<2){say('This video is taking longer to load. Check your connection or select Reload video.');if(retry)retry.hidden=false;}},15000);
      }catch{failed();}finally{busy=false;}
    }
    video.addEventListener('loadedmetadata',ready);
    video.addEventListener('error',()=>{if(source&&!busy&&recoveries++<1)void reload();else failed();});
    video.addEventListener('play',()=>{if(expires<now()+60000){video.pause();void reload();}});
    if(retry){retry.hidden=true;retry.onclick=()=>{recoveries=0;void reload();};}
    // Refresh paused lessons after returning from the background, without autoplaying.
    function visible(){if(!video.isConnected){scope.document?.removeEventListener('visibilitychange',visible);return;}if(!scope.document.hidden&&expires<now()+60000)void reload();}
    scope.document?.addEventListener('visibilitychange',visible);
    if(source)void reload();else if(video.error)failed();else if(video.readyState)ready();
    return {reload};
  }
  scope.TurnlyTrainingVideo={mount};
  if(typeof module!=='undefined')module.exports={mount};
})(globalThis);
