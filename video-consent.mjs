const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const videoConsentItem=item=>/^residential-video-(before|after)(?:-|$)/.test(item?.source_item_id||item?.id||'');
export function consentRecordHtml(record){
 if(!record)return '';
 const strokes=Array.isArray(record.signature)?record.signature:[];
 const paths=strokes.filter(s=>Array.isArray(s)&&s.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))).map(s=>`<polyline points="${s.map(p=>`${p[0]*600},${p[1]*200}`).join(' ')}"/>`).join('');
 return `<section class="video-consent-record" style="padding:16px;border:1px solid #b8d9d5;border-radius:12px;background:#f0f8f7;color:#123a46"><h3>Customer declined video recording</h3><p>Before and after videos waived for this visit.</p><p>${esc(record.consent_text)}</p><p><strong>${esc(record.customer_name)}</strong> · Signed ${esc(new Date(record.signed_at).toLocaleString())}</p><svg role="img" aria-label="Customer signature" viewBox="0 0 600 200" style="width:100%;max-width:600px;background:white;border:1px solid #ccd8dd"><g fill="none" stroke="#123a46" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg><small>Record ${esc(record.id)} · Assignment ${esc(record.assignment_id)}</small></section>`;
}
export async function videoConsentRequest(client,id,action='get',data={}){
 const {data:auth}=await client.auth.getSession();
 if(!auth.session)throw new Error('Sign in again to view the video opt-out.');
 const response=await fetch('/api/assignment-video-consent',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.session.access_token}`},body:JSON.stringify({id,action,...data})});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Unable to save video opt-out.');return result;
}
export function collectVideoConsent(client,id,text,customerName=''){
 return new Promise(resolve=>{
  if(!document.getElementById('turnlySignatureStyles')){
   const css=document.createElement('link');css.id='turnlySignatureStyles';css.rel='stylesheet';css.href='/video-consent.css?v=20261026-app';document.head.append(css);
  }
  const dialog=document.createElement('dialog');dialog.className='turnly-signature';
  dialog.setAttribute('aria-labelledby','videoConsentTitle');
  dialog.innerHTML=`<header class="signature-header"><div><span class="signature-brand">TURNLY • CUSTOMER CONSENT</span><h2 id="videoConsentTitle">Video recording preference</h2></div><button type="button" class="signature-close" data-cancel aria-label="Close signature form">×</button></header><form class="signature-form"><div class="signature-review"><p class="signature-instruction">Hand the device to the customer to review and sign.</p><p class="signature-terms">${esc(text)}</p><label class="signature-name">Customer or authorized adult’s full name<input name="customer_name" value="${esc(customerName)}" required minlength="2" maxlength="160" autocomplete="name" autocapitalize="words" placeholder="Customer’s full name"></label><p class="signature-helper">Confirm the name, or change it if an authorized adult is signing.</p></div><section class="signature-capture"><div class="signature-pad-heading"><strong>Customer signature</strong><button type="button" class="signature-secondary" data-expand>Expand signature</button></div><p class="signature-helper" data-rotate>Use your finger to sign. Turn your phone sideways for more room.</p><canvas width="900" height="300" aria-label="Draw customer signature"></canvas><div class="signature-pad-footer"><span>Sign above the line</span><button type="button" class="signature-link" data-clear>Clear signature</button></div></section><label class="signature-agreement"><input type="checkbox" name="agreed" required><span>I am the customer or an authorized adult. I decline both videos for this visit and agree to save my signature electronically with this cleaning record.</span></label><p class="signature-error" data-error role="alert"></p><footer class="signature-actions"><button type="button" class="signature-secondary" data-cancel-bottom>Back</button><button type="submit" class="signature-primary">Sign & save opt-out</button></footer><p class="signature-footnote">Saved with this assignment for the customer’s reference. Contractors must not sign on the customer’s behalf.</p></form>`;
  document.body.append(dialog);dialog.showModal();
  const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d');let strokes=[],current=null,busy=false,expanded=false,locked=false;
  ctx.strokeStyle='#16233b';ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';
  const redraw=()=>{ctx.clearRect(0,0,900,300);for(const stroke of strokes){ctx.beginPath();stroke.forEach((p,i)=>i?ctx.lineTo(p[0]*900,p[1]*300):ctx.moveTo(p[0]*900,p[1]*300));ctx.stroke();}};
  const point=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))].map(n=>Math.round(n*10000)/10000);};
  canvas.onpointerdown=e=>{if(busy||strokes.length>=40)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);current=[point(e)];strokes.push(current);};
  canvas.onpointermove=e=>{if(!current||busy||current.length>=500)return;e.preventDefault();current.push(point(e));redraw();};
  canvas.onpointerup=canvas.onpointercancel=()=>{current=null;};
  dialog.querySelector('[data-clear]').onclick=()=>{if(!busy){strokes=[];redraw();dialog.querySelector('[data-error]').textContent='';}};
  const restoreScreen=async()=>{if(locked){screen.orientation?.unlock?.();locked=false;}if(document.fullscreenElement===dialog)await document.exitFullscreen().catch(()=>{});};
  dialog.querySelector('[data-expand]').onclick=async()=>{
   expanded=!expanded;dialog.classList.toggle('signature-expanded',expanded);dialog.querySelector('[data-expand]').textContent=expanded?'Done signing':'Expand signature';
   if(expanded){try{await dialog.requestFullscreen?.();await screen.orientation?.lock?.('landscape');locked=true;}catch{dialog.querySelector('[data-rotate]').textContent='Turn your phone sideways for a wider signature pad. Your signature stays saved while you rotate.';}}
   else await restoreScreen();
  };
  const close=async value=>{await restoreScreen();dialog.close();dialog.remove();resolve(value);};
  dialog.querySelector('[data-cancel]').onclick=dialog.querySelector('[data-cancel-bottom]').onclick=()=>{if(!busy)void close(null);};
  dialog.oncancel=e=>{e.preventDefault();if(!busy)void close(null);};
  dialog.querySelector('form').onsubmit=async e=>{
   e.preventDefault();if(busy)return;
   const clean=strokes.filter(s=>s.length>=2),points=clean.reduce((n,s)=>n+s.length,0),distance=clean.reduce((n,s)=>n+s.slice(1).reduce((d,p,i)=>d+Math.hypot(p[0]-s[i][0],p[1]-s[i][1]),0),0);
   if(points<8||distance<.15){dialog.querySelector('[data-error]').textContent='Please draw your complete signature before saving.';return;}
   busy=true;const form=e.target,button=form.querySelector('[type=submit]');button.disabled=true;button.textContent='Saving…';
   try{const result=await videoConsentRequest(client,id,'sign',{customer_name:form.elements.customer_name.value,agreed:form.elements.agreed.checked,signature:clean});await close(result.consent);}
   catch(error){dialog.querySelector('[data-error]').textContent=error.message;busy=false;button.disabled=false;button.textContent='Sign & save opt-out';}
  };
 });
}
