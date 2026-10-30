const BUCKET = 'profile-avatars';
const MAX_INPUT = 20 * 1024 * 1024;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

export function validatePhoto(file) {
  if (!file || !TYPES.has(file.type)) throw new Error('Choose a JPG, PNG, WebP, or HEIC photo.');
  if (!file.size || file.size > MAX_INPUT) throw new Error('Choose a photo smaller than 20 MB.');
}

export async function preparePhoto(file) {
  validatePhoto(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error('This photo could not be opened. Try a JPG or PNG, or take a new photo.'); }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('This photo is empty. Choose another photo.');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; context.fillRect(0, 0, 512, 512);
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth-side)/2, (image.naturalHeight-side)/2, side, side, 0, 0, 512, 512);
    // Re-encode the square preview to remove embedded location/EXIF metadata.
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
    if (!blob) throw new Error('We could not prepare this photo. Please choose another.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

export async function saveProfilePhoto(client, userId, blob, previousPath = '') {
  const {data, error} = await client.auth.getUser();
  if (error || !data?.user || data.user.id !== userId) throw new Error('Please sign in to your own contractor account and try again.');
  if (blob.type !== 'image/jpeg' || blob.size > 2*1024*1024 || !blob.size) throw new Error('Please choose and preview your photo again.');
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const storage = client.storage.from(BUCKET);
  const uploaded = await storage.upload(path, blob, {contentType:'image/jpeg', cacheControl:'3600', upsert:false});
  if (uploaded.error) throw new Error('Your photo could not be uploaded. Check your connection and try again.');
  const avatar_url = storage.getPublicUrl(path).data?.publicUrl;
  let result;
  try {
    if (!avatar_url) throw new Error('Photo URL unavailable');
    result = await client.from('profiles').update({avatar_url, avatar_path:path}).eq('id', userId).select('avatar_url,avatar_path').single();
    if (result.error || !result.data) throw new Error('Profile update failed');
  } catch {
    await storage.remove([path]).catch(()=>{});
    throw new Error('Your account photo could not be saved. Your previous photo is unchanged. Please try again.');
  }
  // Only clean up this user's previous file after the new profile has saved.
  if (previousPath && previousPath.startsWith(userId+'/') && previousPath !== path) await storage.remove([previousPath]).catch(()=>{});
  return result.data;
}

export function openProfilePhoto({client, user, profile, onSaved}) {
  if (document.getElementById('contractorPhotoDialog')) return;
  if (!document.getElementById('contractorPhotoStyle')) {
    const style = document.createElement('link'); style.id='contractorPhotoStyle'; style.rel='stylesheet';
    style.href = new URL('./contractor-profile-photo.css?v=20261030-photo', import.meta.url).href;
    document.head.append(style);
  }
  const dialog = document.createElement('dialog');
  dialog.id='contractorPhotoDialog'; dialog.setAttribute('aria-labelledby','contractorPhotoTitle');
  dialog.innerHTML=`<div class="cp-photo-heading"><h2 id="contractorPhotoTitle">Profile picture</h2><button type="button" data-close aria-label="Close profile picture">×</button></div>
    <p>Choose a clear photo of yourself for your contractor account.</p>
    <div class="cp-photo-preview"><img alt="Profile picture preview" hidden><span aria-hidden="true">Your photo</span></div>
    <div class="cp-photo-choices"><button type="button" data-camera>Take a photo</button><button type="button" data-upload>Upload a photo</button></div>
    <input type="file" data-camera-input accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="user" hidden>
    <input type="file" data-upload-input accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden>
    <p class="cp-photo-help">JPG, PNG, WebP or HEIC · Up to 20 MB. Photos are cropped to a square. Camera availability depends on your device.</p>
    <p data-status role="status" aria-live="polite"></p>
    <div class="cp-photo-actions"><button type="button" data-cancel>Cancel</button><button type="button" data-save disabled>Save photo</button></div>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector), image=$('img'), placeholder=$('.cp-photo-preview span');
  let blob=null, previewUrl='', busy=false, selection=0;
  if (profile?.avatar_url && /^https:\/\//.test(profile.avatar_url)) { image.src=profile.avatar_url; image.hidden=false; placeholder.hidden=true; }
  const status=(text,error=false)=>{ $('[data-status]').textContent=text; $('[data-status]').classList.toggle('cp-photo-error',error); };
  const controls=()=>{ dialog.querySelectorAll('button,input').forEach(el=>el.disabled=busy); $('[data-save]').disabled=busy||!blob; dialog.setAttribute('aria-busy',String(busy)); };
  const close=()=>{ if(!busy)dialog.close(); };
  $('[data-close]').onclick=close; $('[data-cancel]').onclick=close;
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  dialog.addEventListener('close',()=>{selection++;if(previewUrl)URL.revokeObjectURL(previewUrl);dialog.remove();});
  for(const kind of ['camera','upload']) {
    const input=$(`[data-${kind}-input]`);
    $(`[data-${kind}]`).onclick=()=>input.click();
    input.onchange=async()=>{
      const file=input.files?.[0];input.value='';if(!file)return;
      const current=++selection;busy=true;blob=null;controls();status('Preparing your photo…');
      try {
        const prepared=await preparePhoto(file);if(current!==selection)return;
        blob=prepared;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(blob);
        image.src=previewUrl;image.hidden=false;placeholder.hidden=true;status('Preview ready. Save to update your account.');
      } catch(error) { status(error.message,true); }
      finally {busy=false;controls();}
    };
  }
  $('[data-save]').onclick=async()=>{
    if(busy||!blob)return;busy=true;controls();status('Saving your photo…');
    try {
      const saved=await saveProfilePhoto(client,user.id,blob,profile?.avatar_path);
      profile={...profile,...saved};onSaved(saved);status('Your profile picture has been saved.');blob=null;
      $('[data-cancel]').textContent='Done';
    } catch(error){status(error.message,true);}
    finally{busy=false;controls();}
  };
  dialog.showModal();
}
