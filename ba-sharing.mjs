const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const caption=url=>`A cleaner home starts here. Book your first Turnly residential clean with my link: ${url}\n\nI’m a Turnly brand ambassador and may earn a referral commission. Service availability is confirmed during booking.`;
export function sharingPanel(member,assets){
 if(!member?.referrals_ready||!assets)return '<p>Your sharing materials are unavailable. Refresh to try again.</p>';
 const text=caption(assets.url),u=encodeURIComponent(assets.url),t=encodeURIComponent(text);
 return `<div class="ba-share-grid"><div><img class="ba-qr" src="${esc(assets.qr)}" alt="Scan to open your ambassador booking link" width="240" height="240"><p>Customers can scan this QR code to book through your unique link.</p><a class="ba-button" href="${esc(assets.qr)}" download="Turnly-${esc(member.code)}-QR.png">Download QR code</a></div><div><p>Your unique code: <strong>${esc(member.code)}</strong></p><div class="ba-row"><input id="shareLink" aria-label="Your booking link" readonly value="${esc(assets.url)}"><button data-action="copy">Copy link</button></div><h3>Ready to post</h3><label>Promotional caption<textarea id="baCaption" rows="6" readonly>${esc(text)}</textarea></label><div class="ba-row"><button data-share-action="caption">Copy caption</button><a class="ba-button" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=${u}">Facebook</a><a class="ba-button" target="_blank" rel="noopener noreferrer" href="https://x.com/intent/tweet?text=${encodeURIComponent('Book your first Turnly residential clean. I may earn a referral commission.')}&url=${u}">X</a><a class="ba-button" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${t}">WhatsApp</a><a class="ba-button" href="mailto:?subject=Your%20first%20Turnly%20clean&body=${t}">Email</a><a class="ba-button" href="sms:?body=${t}">Text</a><button data-share-action="link">More sharing options</button></div><h3>Share a promotional image</h3><p>Includes your QR code and referral disclosure. Download the image and copy the caption for Instagram, TikTok, Facebook Pages or other social accounts. Paste your booking link into your bio or a story link sticker.</p><div class="ba-row"><button data-share-action="download">Download promo image</button><button data-share-action="image" disabled>Preparing image…</button></div><p id="baImageStatus" role="status"></p><p>Review your post in the selected app before publishing. For Facebook, paste the copied caption and attach the downloaded image in your post.</p></div></div>`;
}
let prepared=null,preparation=0;
export async function preparePromo(assets){
 const generation=++preparation;prepared=null;if(!assets)return;
 const img=new Image();img.src=assets.qr;await img.decode();
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1080;
 const c=canvas.getContext('2d');c.fillStyle='#edf7f4';c.fillRect(0,0,1080,1080);c.textAlign='center';
 c.fillStyle='#087f73';c.font='bold 40px Arial';c.fillText('TURNLY RESIDENTIAL',540,90);
 c.fillStyle='#182b40';c.font='bold 56px Arial';c.fillText('A cleaner home starts here.',540,182);
 c.font='30px Arial';c.fillText('Scan to book your first clean',540,245);
 c.imageSmoothingEnabled=false;c.drawImage(img,270,290,540,540);
 c.font='24px Arial';c.fillText('Your ambassador’s personal booking link',540,890);
 c.font='22px Arial';c.fillText('I may earn a referral commission.',540,960);
 c.fillText('Service availability is confirmed during booking.',540,1000);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 if(!blob)throw new Error('Could not prepare image. Refresh and try again.');
 if(generation===preparation)prepared={url:assets.url,file:new File([blob],'Turnly-booking-promo.png',{type:'image/png'})};
}
function download(file){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export async function shareAction(action,assets){
 const text=caption(assets.url);
 if(action==='caption'){try{await navigator.clipboard.writeText(text);}catch{document.querySelector('#baCaption')?.select();throw new Error('Select and copy the highlighted caption manually.');}return 'Promotional caption copied.';}
 if(action==='link'){
  if(!navigator.share){await navigator.clipboard.writeText(text);return 'Caption and link copied. Paste them into your social app.';}
  await navigator.share({title:'Turnly residential cleaning',text});return 'Sharing window closed.';
 }
 if(!prepared||prepared.url!==assets.url)throw new Error('Image is still preparing. Try again in a moment.');
 if(action==='image'&&navigator.canShare?.({files:[prepared.file]})){await navigator.share({files:[prepared.file],title:'Book with Turnly',text});return 'Sharing window closed. Some apps require you to paste the caption separately.';}
 download(prepared.file);return 'Promotional image downloaded. Copy the caption and upload both in your social app.';
}
