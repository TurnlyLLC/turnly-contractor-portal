export function setupAddress({form,api,enabled,onChange}){
 const f=form.elements,search=document.querySelector('#addressSearch'),list=document.querySelector('#addressSuggestions'),status=document.querySelector('#addressStatus'),fields=document.querySelector('#addressFields'),details=document.querySelector('#homeDetails'),note=document.querySelector('#propertyNote'),lookup=document.querySelector('#lookupProperty');
 let suggestions=[],active=-1,timer,searchVersion=0,lookupVersion=0,loading=false;
 const address=()=>Object.fromEntries(['property_address','city','state','zip'].map(k=>[k,f[k].value]));
 const signature=()=>JSON.stringify(address());
 function close(){list.hidden=true;search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');active=-1;}
 function clearHome(){lookupVersion++;loading=false;f.property_confirmed.checked=false;for(const key of ['beds','baths','sqft'])f[key].value='';lookup.disabled=false;lookup.textContent='Find my home details ↗';note.textContent='Choose an address to load home details, or enter them below.';onChange();}
 function reveal(){fields.hidden=false;details.hidden=false;lookup.hidden=!enabled();}
 function highlight(index){active=index;Array.from(list.children).forEach((el,i)=>el.setAttribute('aria-selected',String(i===active)));if(active>=0){search.setAttribute('aria-activedescendant',list.children[active].id);list.children[active].scrollIntoView({block:'nearest'});}else search.removeAttribute('aria-activedescendant');}
 async function loadHome(){
  const version=++lookupVersion,original=signature();loading=true;lookup.disabled=true;lookup.textContent='Finding your home…';note.textContent='Loading bedrooms, bathrooms, and square footage…';
  try{
   const result=await api('property',address());if(version!==lookupVersion||original!==signature())return;
   f.property_confirmed.checked=false;
   if(result.found){for(const key of ['beds','baths','sqft'])f[key].value=result[key]??'';note.textContent=`Home details from RentCast: ${result.address}. Check these details and correct anything outdated before continuing.`;}
   else note.textContent=result.message||'No home record was found. Enter the details below to continue.';
  }catch{if(version===lookupVersion)note.textContent='Home details are unavailable right now. Enter them below to continue.';}
  finally{if(version===lookupVersion){loading=false;lookup.disabled=false;lookup.textContent='Find my home details ↗';}}
 }
 function choose(index){
  const item=suggestions[index];if(!item)return;
  clearTimeout(timer);searchVersion++;close();clearHome();search.value=item.label;
  for(const key of ['property_address','city','state','zip'])f[key].value=item[key];
  reveal();status.textContent='Address selected. Add or check your unit number below, if needed.';
  if(enabled())loadHome();else note.textContent='Enter your home details below to continue.';
 }
 search.addEventListener('input',()=>{
  clearTimeout(timer);const version=++searchVersion;close();suggestions=[];clearHome();
  for(const key of ['property_address','city','zip'])f[key].value='';
  const query=search.value.trim();status.textContent=query.length<4?'Type at least 4 characters. Include your city to narrow the matches.':'Searching addresses…';
  if(query.length<4)return;
  timer=setTimeout(async()=>{try{
   const result=await api('address_suggestions',{query});if(version!==searchVersion)return;
   suggestions=result.suggestions||[];list.replaceChildren();
   suggestions.forEach((s,i)=>{const item=document.createElement('li');item.id='address-option-'+i;item.setAttribute('role','option');item.setAttribute('aria-selected','false');item.textContent=s.label;item.addEventListener('mousedown',e=>e.preventDefault());item.addEventListener('click',()=>choose(i));list.append(item);});
   list.hidden=!suggestions.length;search.setAttribute('aria-expanded',String(!!suggestions.length));
   status.textContent=suggestions.length?'Choose your address. Use arrow keys and Enter, or tap a match.':result.unavailable?'Suggestions are unavailable. Enter your address manually below.':'No matching address yet. Add your city, or enter the address manually.';
  }catch{if(version===searchVersion)status.textContent='Suggestions are unavailable. Enter your address manually below.';}},400);
 });
 search.addEventListener('keydown',e=>{
  if(e.key==='Escape'){clearTimeout(timer);searchVersion++;close();return;}
  if(list.hidden||!suggestions.length){if(e.key==='Enter')e.preventDefault();return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();highlight(active<0?(e.key==='ArrowDown'?0:suggestions.length-1):(active+(e.key==='ArrowDown'?1:-1)+suggestions.length)%suggestions.length);}
  if(e.key==='Enter'){e.preventDefault();choose(active<0?0:active);}
 });
 search.addEventListener('blur',()=>{clearTimeout(timer);searchVersion++;close();});
 document.querySelector('#manualAddress').onclick=()=>{clearTimeout(timer);searchVersion++;close();reveal();status.textContent='Enter the complete address below. You can look up its home details or enter them yourself.';f.property_address.focus();};
 for(const key of ['property_address','city','state','zip'])f[key].addEventListener('input',()=>{clearHome();search.value='';status.textContent='Address changed. Find home details again, or enter and confirm them below.';});
 for(const key of ['beds','baths','sqft'])f[key].addEventListener('input',()=>{lookupVersion++;loading=false;lookup.disabled=false;lookup.textContent='Find my home details ↗';onChange();});
 lookup.onclick=loadHome;
 return {get loading(){return loading;},get hasAddress(){return !fields.hidden;}};
}
