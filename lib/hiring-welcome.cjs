const { randomInt } = require('node:crypto');
// Alphabetic entries in EFF's short word list #1.
const words = require('./hiring-passphrase-words.json').filter(word => word.length <= 5);
const assetRoot = 'https://portal.turnlypros.com/assets';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
function temporaryPassword() {
  const pickWord = () => {
    const word = words[randomInt(words.length)];
    return word[0].toUpperCase() + word.slice(1);
  };
  const prefix = pickWord() + pickWord();
  const digits = 12 - prefix.length;
  return prefix + String(randomInt(10 ** digits)).padStart(digits, '0');
}
function welcomeDesign(a,password,login,stores) {
  const cleaner = a.role === 'cleaner';
  const graphic = name => ({filename:name+'.png',path:assetRoot+'/'+name+'.png',content_id:name});
  const cell = (contents,style='') => `<tr><td align="center" style="padding:10px 24px;font-family:Arial,sans-serif;color:${cleaner?'#10263b':'#f4fbff'};${style}">${contents}</td></tr>`;
  const credential = (label,value) => cell(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td bgcolor="#f1fbff" style="padding:14px 20px;border:2px solid #00dbed;border-radius:20px;text-align:left;font-family:Arial,sans-serif"><span style="color:#22495b;font-size:15px">${label}</span><br><strong style="font-size:20px;line-height:28px;color:#071e2c;word-break:break-word">${escape(value)}</strong></td></tr></table>`);
  const badge = (name,label,url) => `<td align="center" width="50%"><a href="${escape(url)}"><img src="cid:${name}" alt="${label}" width="160" style="display:block;width:96%;max-width:160px;height:auto;border:0"></a></td>`;
  const app = cleaner ? cell('<strong style="font-size:26px;color:#10263b">Get the Turnly App</strong><br>Manage your schedule and assignments on the go.','border-top:1px solid #94dfe2;padding-top:22px') + cell('<table role="presentation" width="100%" cellspacing="4"><tr>'+badge('turnly-store-ios','Download on the App Store',stores.apple)+badge('turnly-store-android','Get it on Google Play',stores.google)+'</tr></table>') : '';
  const rows = [
    '<tr><td><img src="cid:turnly-portal-header" width="600" alt="Turnly | Portal Access" style="display:block;width:100%;height:auto;border:0"></td></tr>',
    cell(`<strong style="font-size:34px;line-height:40px;color:${cleaner?'#081c32':'white'}">Welcome to Turnly!</strong>`,'padding-top:22px'),
    cell(cleaner ? `Hi ${escape(a.name)},<br><br>Thank you for applying to Turnly Residential Cleaning Services. You’ve been selected to join the Turnly platform as a cleaning contractor.<br><br>Your account is ready. Your login credentials are listed below.` : `Hi ${escape(a.name)}, your ambassador account is ready. Sign in to start onboarding.`),
    credential('Username',a.login_alias||a.email),
    a.login_alias ? cell('You can also sign in with <a style="color:#106475" href="mailto:'+escape(a.email)+'">'+escape(a.email)+'</a>.') : '',
    password ? credential('Temporary password',password) : '',
    cell(password?'Choose a new password at your first sign-in.':'Sign in with your existing password.'),
    cleaner && a.answers?.needs_personal_email ? cell('<a style="color:#106475" href="https://portal.turnlypros.com/contractor-onboarding.html">Confirm your personal email during onboarding.</a>') : '',
    cell(`<table role="presentation" align="center" cellspacing="0"><tr><td bgcolor="#19dfea" style="padding:12px 28px;border-radius:10px"><a style="font:bold 16px Arial;color:#032030;text-decoration:none" href="${escape(login)}">Sign in to Turnly</a></td></tr></table>`),
    cell('Complete your documents and training before '+(cleaner?'accepting cleaning jobs.':'sharing referral links.')),
    app,
    cell('Turnly Professional Cleaning Services<br><a href="mailto:admin@turnlypros.com" style="color:#9ceaff">admin@turnlypros.com</a> · (984) 213-1655','background-color:#052337;color:#ffffff;border-top:1px solid #11708a;padding:18px;font-size:13px')
  ].join('');
  return {
    attachments:[graphic('turnly-portal-header'),...(cleaner?[graphic('turnly-store-ios'),graphic('turnly-store-android')]:[])],
    html:`<table role="presentation" width="100%" bgcolor="${cleaner?'#eef4f8':'#020d18'}" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:12px 0"><!--[if mso]><table role="presentation" width="600"><tr><td><![endif]--><table role="presentation" align="center" width="100%" bgcolor="${cleaner?'#ffffff':'#041c2d'}" cellspacing="0" cellpadding="0" style="max-width:600px;border:1px solid #0dbacb;border-radius:20px">${rows}</table><!--[if mso]></td></tr></table><![endif]--></td></tr></table>`
  };
}
module.exports={temporaryPassword,welcomeDesign};