import {esc} from './ba-shell.mjs';

export function bookingSlides(steps) {
 return `<div class="ba-practice-launch"><p>Click through all ${steps.length} booking screens in a guided practice view. No typing, account creation, or bookings.</p><button type="button" class="ba-primary" data-launch-slides>Start interactive walkthrough →</button></div><dialog class="ba-slides-dialog" aria-label="Booking practice"><section class="ba-slides" aria-label="Interactive booking walkthrough" aria-roledescription="carousel" tabindex="0">
 <div class="ba-slides-top"><strong>Practice the booking journey</strong><span>SLIDES ONLY · NO DATA ENTRY</span><button type="button" class="ba-secondary" data-close-slides>Close ×</button></div>
 <nav class="ba-slides-jumps" aria-label="Booking walkthrough steps">${steps.map((s,i)=>`<button type="button" data-slide="${i}" aria-label="Step ${i+1}: ${esc(s.title)}">${i+1}</button>`).join('')}</nav>
 <div class="ba-slide-screen"><img data-slide-image alt=""><span class="ba-slide-example">Fictional training example — not a live booking form</span></div>
 <div class="ba-slide-caption"><p class="ba-eyebrow" data-slide-counter></p><h4 data-slide-title></h4><p data-slide-body></p></div>
 <div class="ba-slide-controls"><button type="button" class="ba-secondary" data-slide-back>← Back</button><span data-slide-status role="status" aria-live="polite" aria-atomic="true"></span><button type="button" class="ba-primary" data-slide-next>Continue →</button></div>
 <p class="ba-slide-help">Click Continue to experience the next screen. Nothing can be entered or submitted. You can also use the left and right arrow keys, or jump to a step above.</p>
 </section></dialog>`;
}

export function mountBookingSlides(host, steps) {
 if (!host || !steps.length) return;
 const dialog=host.closest('dialog'),launch=dialog.previousElementSibling.querySelector('[data-launch-slides]');
 launch.addEventListener('click',()=>dialog.showModal());
 host.querySelector('[data-close-slides]').addEventListener('click',()=>dialog.close());
 let current=0;
 const image=host.querySelector('[data-slide-image]'),back=host.querySelector('[data-slide-back]'),next=host.querySelector('[data-slide-next]');
 function show(index) {
  current=Math.max(0,Math.min(steps.length-1,index));
  const step=steps[current];
  image.src=step.image;
  image.alt=`Step ${current+1}: ${step.title}. Screenshot with fictional training details; no editable fields.`;
  host.querySelector('[data-slide-counter]').textContent=`SCREEN ${current+1} OF ${steps.length}`;
  host.querySelector('[data-slide-title]').textContent=step.title;
  host.querySelector('[data-slide-body]').textContent=step.body;
  host.querySelector('[data-slide-status]').textContent=`${current+1} of ${steps.length} · ${step.title}`;
  back.disabled=current===0;
  next.textContent=current===steps.length-1?'Practice again ↺':'Continue →';
  host.querySelectorAll('[data-slide]').forEach(button=>{
   if(Number(button.dataset.slide)===current)button.setAttribute('aria-current','step');
   else button.removeAttribute('aria-current');
  });
 }
 host.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button)return;
  if(button.hasAttribute('data-slide'))show(Number(button.dataset.slide));
  else if(button===back)show(current-1);
  else if(button===next)show(current===steps.length-1?0:current+1);
 });
 host.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  if(event.key==='ArrowRight'){event.preventDefault();show(current+1);}
  if(event.key==='ArrowLeft'){event.preventDefault();show(current-1);}
 });
 show(0);
}
