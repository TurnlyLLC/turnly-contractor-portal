// No Meta script runs on the receipt page. Only consented identifiers accompany checkout.
window.turnlyGiftAttribution=()=>{
 const choice=document.querySelector('#giftAdConsent');
 if(!choice?.checked||navigator.globalPrivacyControl===true)return {consent:false};
 try{
  const now=Date.now(),key='turnly-gift-ad-attribution';
  let previous=JSON.parse(localStorage.getItem(key)||'null');
  if(!previous||now-previous.created>30*86400000)previous={created:now};
  const click=new URLSearchParams(location.search).get('fbclid');
  if(click&&/^[A-Za-z0-9_-]{1,500}$/.test(click))previous.fbc=`fb.1.${now}.${click}`;
  if(!previous.fbp)previous.fbp=`fb.1.${now}.${crypto.getRandomValues(new Uint32Array(1))[0]}`;
  localStorage.setItem(key,JSON.stringify(previous));
  return {consent:true,fbc:previous.fbc,fbp:previous.fbp};
 }catch{return {consent:false};}
};
const giftAdChoice=document.querySelector('#giftAdConsent');
if(navigator.globalPrivacyControl===true){giftAdChoice.disabled=true;document.querySelector('#giftAdChoiceNote').textContent='Your browser privacy signal is respected; ad measurement is off.';}
giftAdChoice.addEventListener('change',()=>{if(!giftAdChoice.checked){try{localStorage.removeItem('turnly-gift-ad-attribution');}catch{}}});
