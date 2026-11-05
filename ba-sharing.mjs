import {SIZE,drawPromo,createPromoPdf} from './ba-promo-layout.mjs?v=20261105-branded';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const caption=url=>`A cleaner home starts here. Book your first Turnly residential clean with my link: ${url}\n\nI’m a Turnly brand ambassador and may earn a referral commission. Service availability is confirmed during booking.`;
export function sharingPanel(member,assets){
 if(!member?.referrals_ready||!assets)return '<p>Your sharing materials are unavailable. Refresh to try again.</p>';
 const text=caption(assets.url),u=encodeURIComponent(assets.url),t=encodeURIComponent(text);
 return `<div class="ba-share-grid"><div><img class="ba-qr" src="${esc(assets.qr)}" alt="Scan to open your ambassador booking link" width="240" height="240"><p>Customers can scan this QR code to book through your unique link.</p><a class="ba-button" href="${esc(assets.qr)}" download="Turnly-${esc(member.code)}-QR.png">Download QR code</a></div><div><p>Your unique code: <strong>${esc(member.code)}</strong></p><div class="ba-row"><input id="shareLink" aria-label="Your booking link" readonly value="${esc(assets.url)}"><button data-action="copy">Copy link</button></div><h3>Ready to post</h3><label>Promotional caption<textarea id="baCaption" rows="6" readonly>${esc(text)}</textarea></label><div class="ba-row"><button data-share-action="caption">Copy caption</button><a class="ba-button" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=${u}">Facebook</a><a class="ba-button" target="_blank" rel="noopener noreferrer" href="https://x.com/intent/tweet?text=${encodeURIComponent('Book your first Turnly residential clean. I may earn a referral commission.')}&url=${u}">X</a><a class="ba-button" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${t}">WhatsApp</a><a class="ba-button" href="mailto:?subject=Your%20first%20Turnly%20clean&body=${t}">Email</a><a class="ba-button" href="sms:?body=${t}">Text</a><button data-share-action="link">More sharing options</button></div><h3>Your branded promotional flyer</h3><a href="${esc(assets.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open your ambassador booking link"><img id="baPromoPreview" class="ba-promo-preview" hidden alt="Turnly promotional flyer with your personal booking QR code"></a><p>Uses your actual Turnly logo, personal booking QR code and referral disclosure. The preview and PDF booking button open your referral link. PNG images are not clickable; attach your copied booking link to your social post. Download the image and copy the caption for Instagram, TikTok, Facebook Pages or other social accounts. Paste your booking link into your bio or a story link sticker.</p><div class="ba-row"><button data-share-action="download" data-promo-ready disabled>Download promo image</button><button data-share-action="pdf" data-promo-ready disabled>Download clickable PDF</button><a class="ba-button" href="${esc(assets.url)}" target="_blank" rel="noopener noreferrer">Open my booking link →</a><button data-share-action="image" disabled>Preparing image…</button></div><p id="baImageStatus" role="status"></p><p>Review your post in the selected app before publishing. For Facebook, paste the copied caption and attach the downloaded image in your post.</p></div></div>`;
}
let prepared=null,preparation=0;
export async function preparePromo(assets){
 const generation=++preparation;prepared=null;if(!assets)return;
 const load=async src=>{const img=new Image();img.src=src;await img.decode();return img;};
 const [background,logo,qr]=await Promise.all([load('/assets/ba-promo-background.jpg'),load('/assets/turnly-website-logo.png'),load(assets.qr)]);
 const canvas=document.createElement('canvas');canvas.width=SIZE;canvas.height=SIZE;
 drawPromo(canvas.getContext('2d'),{background,logo,qr});
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 if(!blob)throw new Error('Could not prepare image. Refresh and try again.');
 if(generation!==preparation)return;
 prepared={url:assets.url,file:new File([blob],'Turnly-booking-promo.png',{type:'image/png'})};
 return canvas.toDataURL('image/png');
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
 if(action==='pdf'){const png=await prepared.file.arrayBuffer();const bytes=await createPromoPdf(png,assets.url,await import('./vendor/pdf-lib-1.17.1.mjs'));download(new File([bytes],'Turnly-booking-flyer.pdf',{type:'application/pdf'}));return 'PDF downloaded. Its Book your clean button opens your personal booking link.';}
 if(action==='image'&&navigator.canShare?.({files:[prepared.file]})){await navigator.share({files:[prepared.file],title:'Book with Turnly',text});return 'Sharing window closed. Some apps require you to paste the caption separately.';}
 download(prepared.file);return 'Promotional image downloaded. Copy the caption and upload both in your social app.';
}
