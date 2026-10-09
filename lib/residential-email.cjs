const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function accountEmail(link,purpose,email){
 const setup=purpose==='setup';
 const title=setup?'Verify your email address':'Reset your password';
 const action=setup?'Verify email':'Reset password';
 const url=esc(link);
 // Table-cell spacing and an explicit Outlook button avoid Word rendering
 // differences in link padding, margins, and rounded corners.
 return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${title} | Turnly</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}@media only screen and (max-width:600px){.email-outer{padding:28px 22px!important}.email-title{font-size:28px!important;line-height:35px!important}}</style></head>
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;color:#171717;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${setup?'Confirm your email to finish setting up your Turnly account.':'Use this link to reset your Turnly password.'}</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#ffffff"><tr><td class="email-outer" align="center" style="padding:48px 24px;">
<!--[if mso]><table role="presentation" width="560" border="0" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse;text-align:left;">
<tr><td style="padding:0 0 44px;font-family:Arial,Helvetica,sans-serif;font-size:25px;line-height:30px;font-weight:700;letter-spacing:-1px;color:#151515;">Turnly<span style="color:#087f83;">.</span></td></tr>
<tr><td class="email-title" style="padding:0 0 22px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:40px;font-weight:700;letter-spacing:-.8px;color:#171717;">${title}</td></tr>
<tr><td style="padding:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:#404040;">${setup?'Thanks for creating a Turnly account. Please confirm that this email address belongs to you:':'We received a request to reset the password for your Turnly account:'}</td></tr>
<tr><td style="padding:0 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;font-weight:700;color:#171717;word-break:break-word;">${esc(email)}</td></tr>
<tr><td style="padding:0 0 28px;">
<!--[if mso]><v:roundrect xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:50px;v-text-anchor:middle;width:200px;" arcsize="12%" stroke="f" fillcolor="#006aff"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;">${action}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border-collapse:separate;mso-hide:all;"><tr><td align="center" width="200" height="50" bgcolor="#006aff" style="border-radius:6px;mso-hide:all;"><a href="${url}" style="display:inline-block;width:200px;background-color:#006aff;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:50px;text-align:center;color:#ffffff;text-decoration:none;-webkit-text-size-adjust:none;mso-hide:all;">${action}</a></td></tr></table><!--<![endif]-->
</td></tr>
<tr><td style="padding:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:23px;color:#636363;">${setup?'On the next screen, enter the password you chose when booking. ':''}This link expires in one hour.</td></tr>
<tr><td style="padding:0 0 34px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:23px;color:#636363;">${setup?'If you didn’t create a Turnly account, you can ignore this email.':'If you didn’t request a password reset, you can ignore this email. Your password will stay the same.'}</td></tr>
<tr><td style="border-top:1px solid #e8e8e8;padding:25px 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:#777777;">Turnly Pro Cleaners</td></tr>
<tr><td style="padding:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:#777777;"><a href="https://portal.turnlypros.com/customer.html" style="color:#636363;text-decoration:underline;">portal.turnlypros.com</a></td></tr>
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:#777777;">Need help? <a href="mailto:admin@turnlypros.com" style="color:#636363;text-decoration:underline;">Contact Turnly</a></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}
module.exports={accountEmail};
