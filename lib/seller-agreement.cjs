const {createHash}=require('node:crypto');
const VERSION='20261027-v1';
const TEXT=`TURNLY LLC — INDEPENDENT SALES REPRESENTATIVE AGREEMENT
Turnly LLC, doing business as Turnly Pro Cleaners
144 E King St, STE 303, Hillsborough, NC 27278 • admin@turnlypros.com

1. Parties and effective date
This agreement is between Turnly LLC (Company) and the person identified in the electronic signature record (Representative). It becomes effective when Representative signs electronically. The signed record identifies the Representative's authenticated account, name, acceptance time, and agreement version.

2. Services and independent relationship
Representative promotes Turnly residential cleaning gift cards and services, primarily to realtors, through approved sales tools and their assigned purchase link. Representative controls their schedule and lawful working methods, pays their own business expenses and taxes, and receives no guaranteed hours, salary, leads, benefits, or earnings. This agreement does not override worker classification or other rights under applicable law. Representative has no authority to bind Company, change prices or terms, promise unapproved discounts or refunds, or collect customer money outside Company's checkout.

3. Commission eligibility and calculation
Representative earns 10% of the eligible gift-card amount in a customer's FIRST successfully completed purchase when properly attributed to Representative's purchase link. The first purchase is determined across Turnly's gift-card purchase records, not separately for each representative. Repeat purchases earn no commission. A $100 first purchase earns $10; a first purchase of ten $100 cards earns $100. A later ten-card purchase by the same customer earns $0. Commission is calculated on the eligible gift-card sale amount after applicable discounts and refunds, excluding separately charged taxes and fees; Company's payment processing fees are not deducted from that commission base. A lead status change, checkout started, or unpaid order does not earn commission. Duplicate identities, fabricated purchases, and fraudulent referrals are ineligible. Customer attribution must be recorded at checkout; report attribution concerns promptly for a good-faith review of system evidence.

4. Review, payment, and adjustments
Payments require admin review and approval. There is no fixed payment schedule. Company will review commissions in good faith, will not withhold undisputed earned commissions indefinitely, and will comply with any mandatory payment deadlines. The portal distinguishes earned, awaiting approval, approved, held or adjusted, and recorded paid amounts. Approval is not proof that money has been sent. Refunds, reversed payments, fraud, and payment disputes may reduce, hold, or reverse the related commission. Company will provide transaction-level explanations and resolve disputed amounts reasonably. An overpayment may be reconciled only as permitted by law. No provision waives a mandatory payment right.

5. Marketing and customer protection
Use accurate service descriptions and current published gift-card terms. Confirm service coverage before promising availability. A gift card is credit toward eligible cleaning, not a guarantee that it pays for the entire service. Do not guarantee results, prices, income, or service availability beyond Company's published terms. Identify yourself truthfully and disclose your compensated relationship where required. Follow applicable calling, texting, email, privacy, endorsement, and solicitation laws, including consent and opt-out requirements. Confirm communication permission before using portal send tools. Honor Do not contact immediately; do not evade opt-outs using another number, address, account, or representative. No harassment, deception, unauthorized bulk campaigns, or unlawful automated outreach is permitted.

6. Confidentiality and account security
Use assigned leads and customer information only for authorized Turnly work. Do not export, sell, share, or divert nonpublic customer lists or bookings. Protect credentials, report suspected compromise, and do not store customer payment credentials. Company owns its customer records, trademarks, and provided materials. Permission to use approved branding is limited to authorized work and ends when access is revoked. Confidentiality survives termination while information remains legally protectable; it does not restrict lawful government reports or protected disclosures.

7. Expenses, taxes, and conduct
Representative is responsible for lawful business expenses, registrations, and applicable taxes. Company may request tax documentation before payment and provide required tax reporting. Representative is responsible for their own unlawful or unauthorized conduct to the extent permitted by law; this does not excuse Company's own wrongdoing. No exclusivity or general noncompetition restriction is imposed.

8. Termination and disputes
Either party may end this agreement by written notice to admin@turnlypros.com or the Representative's account contact address. Company may suspend access to protect customers or investigate misuse. Termination does not automatically forfeit valid commissions earned before termination. No new post-termination referrals qualify unless agreed in writing. Parties will first seek good-faith resolution of disputes. North Carolina law governs, subject to mandatory law and rights that cannot be waived. Changes to commission terms require a new disclosed agreement and do not retroactively remove earned compensation.

9. Electronic acceptance and retained copy
By checking the consent box and selecting Sign agreement, Representative confirms they have read this agreement, intend their typed full legal name as their electronic signature, and consent to this electronic record. A dated copy remains accessible in Onboarding. Representative can save or print that record and request a copy through admin@turnlypros.com. Contact Company before signing if electronic acceptance is unsuitable. No checkbox or signature is entered on Representative's behalf.`;
const HASH=createHash('sha256').update(TEXT).digest('hex');
async function current(db,user){
 const S=require('./residential-server.cjs');const p=S.checked(await db.from('crm_pay_plans').select('*').eq('user_id',user.id).order('effective_at',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle())||{mode:'commission',commission_bps:1000,hourly_cents:0};
 const version='20261030-pay-'+(p.id||'default-commission');
 const rate=(p.hourly_cents/100).toFixed(2),pct=p.commission_bps/100;
 let text=TEXT;
 if(p.mode==='commission'){
 text=text.replace('INDEPENDENT SALES REPRESENTATIVE AGREEMENT','COMMISSION-ONLY INDEPENDENT SALES REPRESENTATIVE AGREEMENT').replace('earns 10%',`earns ${pct}%`).replace('A $100 first purchase earns $10; a first purchase of ten $100 cards earns $100.',`A $100 first purchase earns $${pct.toFixed(2)}; a first purchase of ten $100 cards earns $${(pct*10).toFixed(2)}.`);
 }else{
 text=text.replace('INDEPENDENT SALES REPRESENTATIVE AGREEMENT','HOURLY-ONLY INDEPENDENT CONTRACTOR SALES AGREEMENT');
 const a=text.indexOf('3. Commission eligibility'),b=text.indexOf('5. Marketing');
 text=text.slice(0,a)+`3. Hourly compensation and qualification
The agreed rate is USD $${rate} per qualified logged-in hour. This is an hourly-only engagement. These terms apply prospectively from the pay plan's effective date and do not remove previously earned compensation.

Each UTC clock hour is evaluated separately across your portal sessions. Overlapping sessions count once. Required outbound dials = ceiling(logged-in seconds / 3600 × ${p.dials_per_hour||30}). To qualify, the interval must meet that dial target and have at least one human-answered, completed outbound call with an average human-answered duration of at least ${p.min_answered_seconds??30} seconds. Payable hours = qualified logged-in seconds / 3600; gross compensation = payable hours × the rate effective during that interval. Rate changes split an interval. Partial hours have proportional dial targets. In-progress hours are provisional until the clock hour closes and call results settle.

Dial counts require a provider-confirmed outbound call attempt. Answered statistics exclude voicemail, fax, unanswered attempts and unknown classifications. Automated classification is an estimate; report suspected errors, missing activity, lack of available leads or technical outages promptly for human review before settlement. Do not stretch calls, repeatedly call people merely to hit a target, or override opt-outs. You may choose when to work; no minimum schedule or guaranteed work is promised. The clock stops on sign-out or inactivity expiry, with active calls keeping the session open. Nonqualifying intervals remain visible for review and are not automatically erased.

4. Payment and review
${p.payment_terms}
Company reviews time and call records in good faith. Approval and a recorded payment status are distinct; recording paid does not itself transfer funds. Mandatory local payment, worker-classification and wage rights take precedence over any quota or approval condition. No dispute or system error permits forfeiture of compensation legally owed. Contact admin@turnlypros.com to dispute an interval before settlement. Changes to rate, quota or payment terms require a new disclosed agreement; signed copies remain retained.

`+text.slice(b);
 text=text.replace('valid commissions earned before termination','valid compensation earned before termination').replace('No new post-termination referrals qualify unless agreed in writing.','No post-termination work is authorized unless agreed in writing.').replace('Changes to commission terms require a new disclosed agreement','Changes to compensation terms require a new disclosed agreement');
 }
 if(p.mode==='commission')text=text.replace('There is no fixed payment schedule.',p.payment_terms||'There is no fixed payment schedule.');
 return {version,hash:createHash('sha256').update(text).digest('hex'),text,mode:p.mode,plan:p};
}
module.exports={VERSION,TEXT,HASH,current};
