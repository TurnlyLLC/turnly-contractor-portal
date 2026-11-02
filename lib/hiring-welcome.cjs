const { randomInt } = require('node:crypto');
// Alphabetic entries in EFF's short word list #1.
const words = require('./hiring-passphrase-words.json');
const assetRoot = 'https://portal.turnlypros.com/assets';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
function temporaryPassword() {
  const parts = Array.from({length:4}, () => words[randomInt(words.length)]);
  parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1);
  return parts.join('-') + randomInt(10);
}
function welcomeDesign(a,password,login,stores) {
  const cleaner = a.role === 'cleaner';
  const bubble = (label,value) => `<div style="margin:12px 0;padding:12px 16px;border:1px solid #b6d6cc;border-radius:14px;background:#f2f8f5"><small style="color:#35564c">${label}</small><br><strong style="font:600 18px/1.6 Arial;color:#102e24;word-break:break-word">${escape(value)}</strong></div>`;
  const badge = (store,label,url) => `<a href="${escape(url)}" style="display:inline-block;margin:0 8px 8px 0"><img width="150" src="${assetRoot}/email-${store}.png" alt="${label}" style="display:block;border:0"></a>`;
  return {
    attachments:[{filename:'Turnly-logo.png',path:assetRoot+'/turnly-website-logo.png',content_id:'turnly-logo'}],
    html:`<div style="background:#edf4f1;padding:24px 10px;font:16px/1.5 Arial;color:#16382c"><div style="max-width:520px;margin:auto;padding:28px;background:white;border-radius:18px"><img src="cid:turnly-logo" width="128" alt="Turnly"><h1 style="font-size:26px">Welcome to Turnly, ${escape(a.name)}!</h1><p>You’ve been hired as a ${cleaner?'cleaning contractor':'brand ambassador'}. Sign in to start onboarding.</p>${bubble(a.login_alias?'Username':'Username (email)',a.login_alias||a.email)+(a.login_alias?'<p>You can also sign in with '+escape(a.email)+'. Choose your personal email when you change your temporary password.</p>':'')}${password?bubble('Temporary password',password)+'<p>Choose a new password the first time you sign in.</p>':'<p>Use your existing password. You can also choose Forgot password on the sign-in page.</p>'}<p><a href="${login}" style="display:inline-block;background:#16533e;color:white;padding:12px 22px;border-radius:9px;text-decoration:none">Sign in to Turnly</a></p><p>Complete your documents and training before ${cleaner?'accepting cleaning jobs':'sharing referral links'}.</p>${cleaner&&a.answers?.needs_personal_email?'<p><a href="https://portal.turnlypros.com/contractor-onboarding.html">Confirm your personal email during onboarding.</a></p>':''}${cleaner?'<h2 style="font-size:18px">Get the Turnly app</h2>'+badge('apple','Download on the App Store',stores.apple)+badge('google','Get it on Google Play',stores.google):''}<p>Questions? Reply to this email.</p><p>The Turnly team</p></div></div>`
  };
}
module.exports={temporaryPassword,welcomeDesign};
