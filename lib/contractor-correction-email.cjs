const {createHash} = require('node:crypto');
const mobile = require('./mobile-contractor-review.cjs');
const portal = 'https://portal.turnlypros.com/contractor-onboarding.html';
const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail = message => new Error(message);
function checked(result) { if (result.error) throw fail('Could not verify the saved correction.'); return result.data; }
function message(name, title, note) {
  return {
    subject: 'Action needed: update your Turnly onboarding document',
    text: `Hi ${name || 'there'},\n\nPlease update your ${title}. Turnly reviewed your submission and requested the following correction:\n\n${note}\n\nSign in to your contractor portal to review the note and submit your updated document:\n${portal}\n\nThe review note will also remain visible in your portal. Your updated submission will be reviewed by Turnly.\n\nThank you,\nTurnly\nadmin@turnlypros.com`,
    html: `<div style="font-family:Arial,sans-serif;color:#062b46;max-width:600px;margin:auto"><h1 style="color:#073b60">Turnly</h1><h2>Document correction requested</h2><p>Hi ${esc(name || 'there')},</p><p>Please update your <strong>${esc(title)}</strong>.</p><p>Our review note:</p><div style="white-space:pre-wrap;background:#eff9fa;border-left:4px solid #00bdb2;padding:18px">${esc(note)}</div><p>Sign in to review the note and submit your updated document. The note will also remain visible in your portal.</p><p><a href="${portal}" style="display:inline-block;background:#073b60;color:white;padding:14px 20px;border-radius:8px;text-decoration:none">Open contractor portal</a></p><p>Your updated submission will be reviewed by Turnly.</p><p>Thank you,<br>Turnly<br><a href="mailto:admin@turnlypros.com">admin@turnlypros.com</a></p></div>`
  };
}
async function notify(db, actor, input, token, transport = fetch, env = process.env) {
  try {
    let ownerId, ownerEmail, title, note, revision, source;
    if (input.source === 'mobile') {
      const file = await mobile.file(mobile.client(token, transport), input.id);
      const item = file.items.find(i => i.submission?.id === input.submission_id);
      if (!item || item.submission.status !== 'rejected') throw fail('The current submission no longer needs correction. Refresh the record.');
      ownerId = input.id; title = item.title; note = item.submission.reviewerNote;
      revision = item.submission.reviewedAt; source = 'mobile:' + item.submission.id;
    } else if (input.source === 'portal') {
      const doc = checked(await db.from('contractor_documents').select('*').eq('id', input.id).maybeSingle());
      if (!doc || doc.status !== 'rejected') throw fail('The current document no longer needs correction. Refresh the record.');
      ownerId = doc.profile_id || doc.contractor_id; ownerEmail = doc.contractor_email;
      title = doc.title || doc.file_name || doc.document_type || 'onboarding document';
      note = doc.review_notes; revision = doc.reviewed_at; source = 'portal:' + doc.id;
    } else throw fail('Choose a saved correction request.');
    if (!String(note || '').trim() || !revision) throw fail('A saved review note is required before emailing.');
    // The recipient and message come from server records, never a caller-supplied email or note.
    if (!ownerId && !ownerEmail) throw fail('Link this document to a contractor before emailing.');
    const profile = checked(await db.from('profiles').select('id,email,full_name,role,status').eq(ownerId ? 'id' : 'email', ownerId || ownerEmail).maybeSingle());
    if (!profile || profile.role !== 'contractor' || ['deleted','deletion_pending','disabled'].includes(profile.status)) throw fail('A current contractor account is required to send this email.');
    const recipient = String(profile.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) || /@(?:turnly\.invalid|example\.com)$/.test(recipient)) throw fail('Add the contractor’s real email address before sending.');
    const key = createHash('sha256').update(JSON.stringify([source, revision, recipient, note])).digest('hex');
    const sent = checked(await db.from('admin_audit_log').select('id').eq('action', 'contractor_correction_email_sent').eq('entity_id', key).limit(1));
    if (sent?.length) return {sent:true,already_sent:true,recipient};
    if (!env.RESEND_API_KEY || !env.REFERRAL_FROM_EMAIL) throw fail('The email service is not configured.');
    const response = await transport('https://api.resend.com/emails', {
      method:'POST', headers:{Authorization:'Bearer '+env.RESEND_API_KEY.trim(),'Content-Type':'application/json','Idempotency-Key':'contractor-correction-'+key},
      body:JSON.stringify({from:env.REFERRAL_FROM_EMAIL.trim(),to:[recipient],reply_to:'admin@turnlypros.com',...message(profile.full_name,title,note)}),
      signal:AbortSignal.timeout(15000)
    });
    const receipt = await response.json();
    if (!response.ok || !receipt.id) throw fail('The email service did not confirm sending. Please retry the correction email.');
    const audit = await db.from('admin_audit_log').insert({actor_id:actor,action:'contractor_correction_email_sent',entity:'contractor_correction',entity_id:key,
      after_value:JSON.stringify({profile_id:profile.id,source,reviewed_at:revision,recipient,provider_id:receipt.id}),source:'contractor_directory'});
    return {sent:true,recipient,...(audit.error?{warning:'Email sent, but the delivery record could not be saved. Avoid resending.'}:{})};
  } catch (error) {
    return {sent:false,error:error.message?.startsWith('The ') || error.message?.startsWith('A ') || error.message?.startsWith('Add ') || error.message?.startsWith('Link ') || error.message?.startsWith('Could ') ? error.message : 'Email could not be confirmed. Please retry the correction email.'};
  }
}
module.exports = {notify,message};
