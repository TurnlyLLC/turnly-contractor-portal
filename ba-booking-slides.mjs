import {esc} from './ba-shell.mjs';

export function bookingSlides(steps, portal=false) {
 const subject=portal?'portal':'booking';
 return `<div class="ba-practice-launch"><p>Click through all ${steps.length} ${subject} screens in a guided practice view. No typing, account creation, or bookings.</p><button type="button" class="ba-primary" data-launch-slides>Start interactive walkthrough →</button></div><dialog class="ba-slides-dialog" aria-label="${subject} practice"><section class="ba-slides" aria-label="Interactive ${subject} walkthrough" aria-roledescription="carousel" tabindex="0">
 <div class="ba-slides-top"><strong>${portal?'Explore your ambassador portal':'Practice the booking journey'}</strong><span>SLIDES ONLY · NO DATA ENTRY</span><button type="button" class="ba-secondary" data-close-slides>Close ×</button></div>
 <nav class="ba-slides-jumps" aria-label="${subject} walkthrough steps">${steps.map((s,i)=>`<button type="button" data-slide="${i}" aria-label="Step ${i+1}: ${esc(s.title)}">${i+1}</button>`).join('')}<div class="ba-slide-view-tools" aria-label="Screenshot view"><button type="button" data-view="width">Fit width</button><button type="button" data-view="fit">Fit screen</button><button type="button" data-view="out" aria-label="Zoom out">−</button><span data-zoom-label aria-live="polite">100%</span><button type="button" data-view="in" aria-label="Zoom in">+</button><button type="button" data-view="notes" aria-expanded="false">Show notes</button></div></nav>
 <div class="ba-slide-screen"><img data-slide-image alt=""><span class="ba-slide-example">Fictional training example — not a live ${subject} form</span></div>
 <div class="ba-slide-caption" hidden><p class="ba-eyebrow" data-slide-counter></p><h4 data-slide-title></h4><p data-slide-body></p></div>
 <div class="ba-slide-controls"><button type="button" class="ba-secondary" data-slide-back>← Back</button><span data-slide-status role="status" aria-live="polite" aria-atomic="true"></span><button type="button" class="ba-primary" data-slide-next>Continue →</button></div>
 <p class="ba-slide-help">Click Continue to experience the next screen. Nothing can be entered or submitted. You can also use the left and right arrow keys, or jump to a step above.</p>
 </section></dialog>`;
}

export function mountBookingSlides(host, steps) {
 if (!host || !steps.length) return;
 const dialog=host.closest('dialog'),launch=dialog.previousElementSibling.querySelector('[data-launch-slides]');
 launch.addEventListener('click',()=>dialog.showModal());
 host.querySelector('[data-close-slides]').addEventListener('click',()=>dialog.close());
 let current=0,zoom=100;
 const screen=host.querySelector('.ba-slide-screen'),caption=host.querySelector('.ba-slide-caption');
 function setZoom(value){
  zoom=Math.max(50,Math.min(200,value));
  host.classList.remove('ba-fit-screen');
  image.style.width=zoom+'%';
  host.querySelector('[data-zoom-label]').textContent=zoom+'%';
 }

 const image=host.querySelector('[data-slide-image]'),back=host.querySelector('[data-slide-back]'),next=host.querySelector('[data-slide-next]');
 function show(index) {
  current=Math.max(0,Math.min(steps.length-1,index));
  const step=steps[current];
  image.src=step.image;
  screen.scrollTo(0,0);
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
  if(button.dataset.view){
   const view=button.dataset.view;
   if(view==='notes'){
    caption.hidden=!caption.hidden;host.classList.toggle('ba-show-notes',!caption.hidden);
    button.setAttribute('aria-expanded',String(!caption.hidden));button.textContent=caption.hidden?'Show notes':'Hide notes';
   }else if(view==='fit'){
    host.classList.add('ba-fit-screen');image.style.width='100%';screen.scrollTo(0,0);
    host.querySelector('[data-zoom-label]').textContent='Fit';
   }else setZoom(view==='width'?100:zoom+(view==='in'?25:-25));
  }
  else if(button.hasAttribute('data-slide'))show(Number(button.dataset.slide));
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
