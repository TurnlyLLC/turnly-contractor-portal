const { PDFDocument, PDFName, PDFString, rgb, StandardFonts } = require('pdf-lib');
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
  const row={name:clean(input.name,160),brokerage:clean(input.brokerage,180),email:clean(input.email,1000),phone:clean(input.phone,1000),
    status:clean(input.status)||'new',notes:clean(input.notes,5000),follow_up_on:input.follow_up_on || null,sms_consent:input.sms_consent===true};
  if(!row.name) throw new Error('Agent name is required.');
  for(const key of ['city','address','state','website','postal_code','phone_1','phone_2','phone_3','email_2','email_3','email_1_phone','email_2_phone','email_3_phone']) row[key]=clean(input[key],2000);
  if(!STATUSES.includes(row.status)) throw new Error('Choose a valid agent status.');
  if(row.follow_up_on && (!/^\d{4}-\d{2}-\d{2}$/.test(row.follow_up_on) || !Number.isFinite(Date.parse(row.follow_up_on)))) throw new Error('Enter a valid follow-up date.');
  return row;
}
function referralUrl(code) {
  if(!codeValid(code)) throw new Error('This agent has no active referral code.');
  return `${ORIGIN}/r/${Buffer.from(code.slice(3),'hex').toString('base64url')}`;
}
function referralCodeFromSlug(slug){
  if(!/^[A-Za-z0-9_-]{22}$/.test(String(slug||'')))return null;
  const bytes=Buffer.from(slug,'base64url');
  return bytes.length===16&&bytes.toString('base64url')===slug?'TA-'+bytes.toString('hex').toUpperCase():null;
}
async function addBookingFooter(pdf,code){
  const {width,height}=pdf.getPage(0).getSize(),footer=48;
  const output=await PDFDocument.create(),[original]=await output.embedPdf(await pdf.save(),[0]);
  const page=output.addPage([width,height+footer]);page.drawPage(original,{x:0,y:footer,width,height});
  page.drawRectangle({x:0,y:0,width,height:footer,color:rgb(.02,.09,.19)});
  const font=await output.embedFont(StandardFonts.HelveticaBold),url=referralUrl(code),label='BOOK ONLINE - SHARE THIS LINK WITH YOUR CLIENTS';
  const draw=(text,y,size)=>page.drawText(text,{x:(width-font.widthOfTextAtSize(text,size))/2,y,size,font,color:rgb(.65,.95,1)});
  draw(label,31,Math.min(9,(width-30)/font.widthOfTextAtSize(label,1)));
  draw(url.replace('https://',''),12,Math.min(12,(width-30)/font.widthOfTextAtSize(url.replace('https://',''),1)));
  const link=output.context.register(output.context.obj({Type:'Annot',Subtype:'Link',Rect:[0,0,width,footer],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(url)}}));
  page.node.set(PDFName.of('Annots'),output.context.obj([link]));
  return Buffer.from(await output.save());
}
function qrImage(code) { return QRCode.toDataURL(referralUrl(code),{errorCorrectionLevel:'M',margin:4,width:720}); }
function placement(input) {
  const result={qr_x:Number(input.qr_x),qr_y:Number(input.qr_y),qr_size:Number(input.qr_size)};
  const {qr_x:x,qr_y:y,qr_size:s}=result;
  if(![x,y,s].every(Number.isFinite)||x<0||y<0||s<12||s>35||x+s>100||y>94) throw new Error('QR placement must fit the page, with room below for the referral ID.');
  return result;
}
async function makeFlyer(template,settings,code) {
  const isPng=Buffer.from(template).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const pdf=isPng?await PDFDocument.create():await PDFDocument.load(template);
  if(isPng){
    const background=await pdf.embedPng(template),scale=612/background.width;
    const page=pdf.addPage([612,background.height*scale]);
    page.drawImage(background,{x:0,y:0,width:612,height:background.height*scale});
    // Replace both the sample QR and its caption on the supplied 1102 x 1427 flyer.
    page.drawRectangle({x:840*scale,y:(1427-1390)*scale,width:225*scale,height:196*scale,color:rgb(.91,.97,1)});
    const qr=await pdf.embedPng(await qrImage(code));
    page.drawImage(qr,{x:879*scale,y:(1427-1356)*scale,width:150*scale,height:150*scale});
    const font=await pdf.embedFont(StandardFonts.HelveticaBold),label='SCAN TO REQUEST YOUR CLEAN';
    page.drawText(label,{x:860*scale,y:(1427-1377)*scale,size:8*scale,font,color:rgb(.02,.08,.22)});
    return addBookingFooter(pdf,code);
  }
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
  return addBookingFooter(pdf,code);
}
module.exports={ORIGIN,STATUSES,uuid,codeValid,clean,phone,email,agentInput,referralUrl,referralCodeFromSlug,qrImage,placement,makeFlyer};
