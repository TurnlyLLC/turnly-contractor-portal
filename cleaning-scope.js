// Both services stay visible. Open disclosures for shared policy-section links.
function revealPolicyAnchor() {
 const anchor=document.getElementById(location.hash.slice(1));
 if(!anchor)return;
 let parent=anchor.parentElement;
 while(parent){
  if(parent.tagName==='DETAILS')parent.open=true;
  parent=parent.parentElement;
 }
 anchor.scrollIntoView({block:'start'});
}
revealPolicyAnchor();
window.addEventListener('hashchange',revealPolicyAnchor);
