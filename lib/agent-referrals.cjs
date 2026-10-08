const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const ORIGIN = 'https://portal.turnlypros.com';
const STATUSES = ['new','follow_up','not_interested','interested','active'];
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(value || ''));
const codeValid = value => /^TA-[A-F0-9]{32}$/.test(String(value || ''));
function clean(value, max=500) { return String(value ?? '').trim().slice(0,max); }
function phone(value) {
  const raw=clean(value,40), digits=raw.replace(/\D/g,'');
  if(!digits) return '';
  if(digits.length===10) return '+1'+digits;
  if(digits.length===11 && digits[0]==='1') return '+'+digits;
  if(raw.startsWith('+') && digits.length>=8 && digits.length<=15) return '+'+digits;
  throw new Error('Enter a valid phone number, including country code for non-US numbers.');
}
function email(value) {
  const result=clean(value,254).toLowerCase();
  if(result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error('Enter a valid email address.');
  return result;
}
function agentInput(input) {
  const row={name:clean(input.name,160),brokerage:clean(input.brokerage,180),email:email(input.email),phone:phone(input.phone),
    status:clean(input.status)||'new',notes:clean(input.notes,5000),follow_up_on:input.follow_up_on || null,sms_consent:input.sms_consent===true};
  if(!row.name) throw new Error('Agent name is required.');
  if(!row.email && !row.phone) throw new Error('Enter an email address or phone number.');
  if(!STATUSES.includes(row.status)) throw new Error('Choose a valid agent status.');
  if(row.follow_up_on && (!/^\d{4}-\d{2}-\d{2}$/.test(row.follow_up_on) || !Number.isFinite(Date.parse(row.follow_up_on)))) throw new Error('Enter a valid follow-up date.');
  return row;
}
function referralUrl(code) {
  if(!codeValid(code)) throw new Error('This agent has no active referral code.');
  return `${ORIGIN}/residential-referral.html?ref=${code}`;
}
function qrImage(code) { return QRCode.toDataURL(referralUrl(code),{errorCorrectionLevel:'M',margin:4,width:720}); }
function placement(input) {
  const result={qr_x:Number(input.qr_x),qr_y:Number(input.qr_y),qr_size:Number(input.qr_size)};
  const {qr_x:x,qr_y:y,qr_size:s}=result;
  if(![x,y,s].every(Number.isFinite)||x<0||y<0||s<12||s>35||x+s>100||y+s>94) throw new Error('QR placement must fit the page, with room below for the referral ID.');
  return result;
}
async function makeFlyer(template,settings,code) {
  const pdf=await PDFDocument.load(template);
  if(pdf.getPageCount()!==1) throw new Error('Upload a one-page PDF flyer.');
  const page=pdf.getPage(0), {width,height}=page.getSize();
  if(page.getRotation().angle!==0) throw new Error('Export the flyer without page rotation before uploading.');
  const pos=placement(settings), size=width*pos.qr_size/100, x=width*pos.qr_x/100, y=height*(1-pos.qr_y/100)-size;
  if(y<30 || x+size>width || y+size>height) throw new Error('QR placement does not fit this flyer.');
  const png=await pdf.embedPng(await qrImage(code));
  page.drawImage(png,{x,y,width:size,height:size});
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({x,y:y-25,width:size,height:25,color:rgb(1,1,1)});
  const label='Scan to request your clean';
  page.drawText(label,{x:x+3,y:y-10,size:Math.min(9,(size-6)/font.widthOfTextAtSize(label,1)),font,color:rgb(0,0,0)});
  page.drawText(code,{x:x+3,y:y-20,size:Math.min(6,(size-6)/font.widthOfTextAtSize(code,1)),font,color:rgb(0,0,0)});
  return Buffer.from(await pdf.save());
}
module.exports={ORIGIN,STATUSES,uuid,codeValid,clean,phone,email,agentInput,referralUrl,qrImage,placement,makeFlyer};
