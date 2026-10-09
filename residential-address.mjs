export function setupAddress({form,api,enabled,onChange}){
 const f=form.elements,search=document.querySelector('#addressSearch'),list=document.querySelector('#addressSuggestions'),status=document.querySelector('#addressStatus'),fields=document.querySelector('#addressFields'),details=document.querySelector('#homeDetails'),note=document.querySelector('#propertyNote');
 const searchCache=new Map(),homeCache=new Map();
 let suggestions=[],active=-1,timer,lookupVersion=0,loading=false,inFlight=false,searchOpen=false,lastQuery='',selectedLabel='',editing=false,manual=false;
 const address=()=>Object.fromEntries(['property_address','city','state','zip'].map(k=>[k,f[k].value]));
 const signature=()=>JSON.stringify(address()).toLowerCase();
 const key=q=>q.trim().toLowerCase();
 function message(text=''){note.textContent=text;note.hidden=!text;}
 function close(){list.hidden=true;search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');active=-1;}
 function saveHome(){if(f.property_address.value&&f.zip.value&&f.sqft.value)homeCache.set(signature(),Object.fromEntries(['beds','baths','sqft'].map(k=>[k,f[k].value])));}
 function clearHome(){lookupVersion++;loading=false;f.property_confirmed.checked=false;for(const k of ['beds','baths','sqft'])f[k].value='';message();onChange();}
 function reveal(){fields.hidden=false;details.hidden=false;}
 function highlight(index){active=index;Array.from(list.children).forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));if(active>=0){search.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});}else search.removeAttribute('aria-activedescendant');}
 function render(items){suggestions=items;active=-1;search.removeAttribute('aria-activedescendant');list.replaceChildren();for(const [i,s] of items.entries()){const el=document.createElement('li');el.id='address-option-'+i;el.setAttribute('role','option');el.setAttribute('aria-selected','false');el.textContent=s.label;el.onpointerdown=e=>e.preventDefault();el.onclick=()=>choose(i);list.append(el);}list.hidden=!items.length;search.setAttribute('aria-expanded',String(!!items.length));}
 async function searchLatest(){
  if(inFlight||!searchOpen)return;const query=search.value.trim(),queryKey=key(query);if(query.length<4||queryKey===lastQuery)return;
  if(searchCache.has(queryKey)){render(searchCache.get(queryKey));lastQuery=queryKey;return;}
  inFlight=true;lastQuery=queryKey;search.setAttribute('aria-busy','true');
  try{const result=await api('address_suggestions',{query});const items=result.suggestions||[];if(!result.unavailable){if(searchCache.size>=60)searchCache.delete(searchCache.keys().next().value);searchCache.set(queryKey,items);}
   if(searchOpen&&key(search.value)===queryKey){render(items);status.textContent=items.length?'Choose your address.':result.unavailable?'Enter your address manually if no match appears.':'Add your city to narrow the matches, or enter the address manually.';}
  }catch{if(searchOpen&&key(search.value)===queryKey)status.textContent='Enter your address manually if no match appears.';}
  finally{inFlight=false;search.setAttribute('aria-busy','false');if(searchOpen&&key(search.value)!==queryKey)searchLatest();}
 }
 async function loadHome(){
  const original=signature(),version=++lookupVersion;loading=true;message('Loading your home details…');
  try{const cached=homeCache.get(original),r=cached?{found:true,...cached}:await api('property',address());
   if(version!==lookupVersion||original!==signature())return;
   if(r.found){for(const k of ['beds','baths','sqft'])f[k].value=r[k]??'';saveHome();message();}
   else message('Enter your home details below to continue.');
  }catch{if(version===lookupVersion)message('Enter your home details below to continue.');}
  finally{if(version===lookupVersion)loading=false;}
 }
 function choose(index){const item=suggestions[index];if(!item)return;saveHome();clearTimeout(timer);searchOpen=false;close();const same=!editing&&signature()===JSON.stringify(Object.fromEntries(['property_address','city','state','zip'].map(k=>[k,item[k]]))).toLowerCase();
  search.value=item.label;selectedLabel=item.label;editing=false;manual=false;
  if(same){status.textContent='';return;}clearHome();for(const k of ['property_address','city','state','zip'])f[k].value=item[k];reveal();status.textContent='';if(enabled())loadHome();
 }
 search.addEventListener('input',()=>{saveHome();editing=search.value!==selectedLabel;searchOpen=true;manual=false;onChange();const query=search.value.trim();if(query.length<4){close();status.textContent='Start with your street address and city.';return;}
  status.textContent='';if(searchCache.has(key(query))){render(searchCache.get(key(query)));lastQuery=key(query);}else{lastQuery=key(query)===lastQuery?lastQuery:'';if(!timer)timer=setTimeout(()=>{timer=null;searchLatest();},100);}
 });
 search.addEventListener('focus',()=>{searchOpen=true;if(editing&&searchCache.has(key(search.value)))render(searchCache.get(key(search.value)));});
 search.addEventListener('keydown',e=>{if(e.key==='Escape'){searchOpen=false;close();return;}if(list.hidden||!suggestions.length){if(e.key==='Enter')e.preventDefault();return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();highlight(active<0?(e.key==='ArrowDown'?0:suggestions.length-1):(active+(e.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length);}if(e.key==='Enter'){e.preventDefault();choose(active<0?0:active);}});
 search.addEventListener('blur',()=>{searchOpen=false;close();});
 document.querySelector('#manualAddress').onclick=()=>{searchOpen=false;close();saveHome();manual=true;editing=false;reveal();status.textContent='';f.property_address.focus();};
 for(const k of ['property_address','city','state','zip'])f[k].addEventListener('input',()=>{clearHome();manual=true;editing=false;search.value='';selectedLabel='';status.textContent='';});
 for(const k of ['property_address','city','state','zip'])f[k].addEventListener('change',()=>{if(enabled()&&f.property_address.value&&f.city.value&&/^[a-z]{2}$/i.test(f.state.value)&&/^\d{5}(?:-\d{4})?$/.test(f.zip.value))loadHome();});
 for(const k of ['beds','baths','sqft'])f[k].addEventListener('input',()=>{lookupVersion++;loading=false;message();saveHome();onChange();});
 return {get loading(){return loading;},get hasAddress(){return !fields.hidden&&(!editing||manual);}};
}
