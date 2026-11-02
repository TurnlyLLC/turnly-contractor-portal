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
  const graphic = name => ({filename:name+'.png',path:assetRoot+'/'+name+'.png',content_id:name});
  const cell = (contents,style='') => `<tr><td align="center" style="padding:10px 24px;font-family:Arial,sans-serif;color:#c2eaff;${style}">${contents}</td></tr>`;
  const credential = (label,value) => cell(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td bgcolor="#073344" style="padding:14px 20px;border:2px solid #00dbed;border-radius:20px;text-align:left;font-family:Arial,sans-serif"><span style="color:#a2e5ff;font-size:14px">${label}</span><br><strong style="font-size:20px;line-height:28px;color:#ffffff;word-break:break-word">${escape(value)}</strong></td></tr></table>`);
  const badge = (name,label,url) => `<td align="center" width="50%"><a href="${escape(url)}"><img src="cid:${name}" alt="${label}" width="160" style="display:block;width:96%;max-width:160px;height:auto;border:0"></a></td>`;
  const app = cleaner ? cell('<strong style="font-size:24px;color:white">Get the Turnly App</strong><br>Check your schedule and assignments on the go.','border-top:1px solid #11708a;padding-top:22px') + cell('<table role="presentation" width="100%" cellspacing="4"><tr>'+badge('turnly-store-ios','Download on the App Store',stores.apple)+badge('turnly-store-android','Get it on Google Play',stores.google)+'</tr></table>') : '';
  const rows = [
    '<tr><td><img src="cid:turnly-portal-header" width="600" alt="Turnly | Portal Access" style="display:block;width:100%;height:auto;border:0"></td></tr>',
    cell('<strong style="font-size:34px;line-height:40px;color:white">Welcome to Turnly!</strong>','padding-top:22px'),
    cell(`Hi ${escape(a.name)}, your ${cleaner?'contractor':'ambassador'} account is ready. Sign in to start onboarding.`),
    credential('Username',a.login_alias||a.email),
    a.login_alias ? cell('You can also sign in with '+escape(a.email)+'.') : '',
    password ? credential('Temporary password',password) : '',
    cell(password?'Choose a new password at your first sign-in.':'Sign in with your existing password.'),
    cleaner && a.answers?.needs_personal_email ? cell('<a style="color:#82e7ff" href="https://portal.turnlypros.com/contractor-onboarding.html">Confirm your personal email during onboarding.</a>') : '',
    cell(`<table role="presentation" align="center" cellspacing="0"><tr><td bgcolor="#19dfea" style="padding:12px 28px;border-radius:10px"><a style="font:bold 16px Arial;color:#032030;text-decoration:none" href="${escape(login)}">Sign in to Turnly</a></td></tr></table>`),
    cell('Complete your documents and training before '+(cleaner?'accepting cleaning jobs.':'sharing referral links.')),
    app,
    cell('Turnly Professional Cleaning Services<br><a href="mailto:admin@turnlypros.com" style="color:#9ceaff">admin@turnlypros.com</a>','border-top:1px solid #11708a;padding:18px;font-size:13px')
  ].join('');
  return {
    attachments:[graphic('turnly-portal-header'),...(cleaner?[graphic('turnly-store-ios'),graphic('turnly-store-android')]:[])],
    html:`<table role="presentation" width="100%" bgcolor="#020d18" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:12px 0"><!--[if mso]><table role="presentation" width="600"><tr><td><![endif]--><table role="presentation" align="center" width="100%" bgcolor="#041c2d" cellspacing="0" cellpadding="0" style="max-width:600px;border:1px solid #0dbacb;border-radius:20px">${rows}</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table>`
  };
}
module.exports={temporaryPassword,welcomeDesign};