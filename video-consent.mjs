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
export function collectVideoConsent(client,id,text){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.style.cssText='width:min(650px,94vw);max-height:90vh;overflow:auto;border:0;border-radius:18px;padding:24px;color:#123a46;background:white;z-index:100000;font:16px/1.5 system-ui,sans-serif';
  dialog.innerHTML=`<h2>Customer video opt-out</h2><p>Hand the device to the customer to review and sign. Contractors must not sign on the customer’s behalf.</p><p>${esc(text)}</p><form><label style="display:block">Customer or authorized adult’s full name<input name="customer_name" required minlength="2" maxlength="160" autocomplete="off" style="display:block;width:100%;padding:12px;margin:8px 0"></label><p>Draw your signature below.</p><canvas width="600" height="200" aria-label="Draw customer signature" style="width:100%;height:180px;touch-action:none;background:#fff;border:2px solid #78979b;border-radius:8px"></canvas><button type="button" data-clear>Clear signature</button><label style="display:flex;gap:12px;margin:18px 0"><input type="checkbox" name="agreed" required> I am the customer or an authorized adult. I decline both videos for this visit and agree to save my signature electronically with this cleaning record.</label><p data-error role="alert"></p><div style="display:flex;gap:12px"><button type="button" data-cancel>Cancel</button><button type="submit" style="background:#008577;color:white;border:0;padding:14px;border-radius:8px">Sign and save opt-out</button></div></form>`;
  document.body.append(dialog);dialog.showModal();
  const canvas=dialog.querySelector('canvas'),ctx=canvas.getContext('2d');let strokes=[],current=null,busy=false;
  ctx.strokeStyle='#123a46';ctx.lineWidth=2.5;ctx.lineCap='round';
  const point=e=>{const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))].map(n=>Math.round(n*10000)/10000);};
  canvas.onpointerdown=e=>{if(busy)return;canvas.setPointerCapture(e.pointerId);current=[point(e)];strokes.push(current);};
  canvas.onpointermove=e=>{if(!current||busy||current.length>=500)return;const p=point(e),last=current.at(-1);current.push(p);ctx.beginPath();ctx.moveTo(last[0]*600,last[1]*200);ctx.lineTo(p[0]*600,p[1]*200);ctx.stroke();};
  canvas.onpointerup=canvas.onpointercancel=()=>{current=null;};
  dialog.querySelector('[data-clear]').onclick=()=>{if(!busy){strokes=[];ctx.clearRect(0,0,600,200);}};
  const close=value=>{dialog.close();dialog.remove();resolve(value);};
  dialog.querySelector('[data-cancel]').onclick=()=>{if(!busy)close(null);};
  dialog.oncancel=e=>{e.preventDefault();if(!busy)close(null);};
  dialog.querySelector('form').onsubmit=async e=>{
   e.preventDefault();if(busy)return;busy=true;const form=e.target,button=form.querySelector('[type=submit]');button.disabled=true;
   try{const result=await videoConsentRequest(client,id,'sign',{customer_name:form.elements.customer_name.value,agreed:form.elements.agreed.checked,signature:strokes});close(result.consent);}
   catch(error){dialog.querySelector('[data-error]').textContent=error.message;busy=false;button.disabled=false;}
  };
 });
}
