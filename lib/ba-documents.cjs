const S=require('./residential-server.cjs'),G=require('./ba-agreement.cjs'),{PDFDocument,StandardFonts,rgb}=require('pdf-lib'),fs=require('node:fs'),path=require('node:path');
const W9_VERSION='irs-w9-2024-03';
const CERTIFICATION=`Under penalties of perjury, I certify that:\n1. The number shown on this form is my correct taxpayer identification number (or I am waiting for a number to be issued to me); and\n2. I am not subject to backup withholding because (a) I am exempt from backup withholding, or (b) I have not been notified by the Internal Revenue Service (IRS) that I am subject to backup withholding as a result of a failure to report all interest or dividends, or (c) the IRS has notified me that I am no longer subject to backup withholding; and\n3. I am a U.S. citizen or other U.S. person; and\n4. The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.`;
const textFields={agreement:['name','address','signature_name'],w9:['name','business_name','classification','llc_class','other_class','exempt_payee','fatca','address','city_state_zip','account_numbers','tin_type','tin','signature_name']};
const boolFields={agreement:['consent','marketing','insurance','payout'],w9:['foreign_partners','backup_withholding','certify','consent']};
function normalize(kind,input,complete=false){
 if(!textFields[kind]||!input||typeof input!=='object'||Array.isArray(input))throw S.fail('Choose an onboarding document.');
 const data={};for(const key of textFields[kind]){if(input[key]!==undefined){if(typeof input[key]!=='string'||input[key].length>300)throw S.fail('Keep each field under 300 characters.');data[key]=input[key].trim();}}
 for(const key of boolFields[kind])data[key]=input[key]===true;
 data.page=Number.isInteger(input.page)?Math.max(0,Math.min(3,input.page)):0;
 if(data.tin)data.tin=data.tin.replace(/[ -]/g,'');
 if(!complete)return data;
 if(!data.name||!data.signature_name||data.signature_name.length<2||!data.consent)throw S.fail('Enter your legal name and signature, and agree to electronic signing.');
 if(kind==='agreement'){if(!data.marketing||!data.insurance||!data.payout)throw S.fail('Review and confirm each agreement acknowledgment.');data.text=G.TEXT;}
 else{
  if(!['individual','c_corp','s_corp','partnership','trust','llc','other'].includes(data.classification))throw S.fail('Select your federal tax classification.');
  if(data.classification==='llc'&&!['C','S','P'].includes(data.llc_class))throw S.fail('Select the LLC tax classification.');
  if(data.classification==='other'&&!data.other_class)throw S.fail('Describe your other tax classification.');
  if(!data.address||!data.city_state_zip||!['ssn','ein'].includes(data.tin_type)||!/^\d{9}$/.test(data.tin||''))throw S.fail('Complete your address and nine-digit taxpayer identification number.');
  if(!data.certify)throw S.fail('Review and certify the W-9 before signing.');data.certification=CERTIFICATION;
 }
 return data;
}
async function w9Pdf(data,signedAt){
 const doc=await PDFDocument.load(fs.readFileSync(path.join(__dirname,'../assets/irs-w9.pdf'))),form=doc.getForm(),fields=form.getFields();
 const text=(n,value)=>{const f=fields.find(f=>f.getName().endsWith(`.f1_${String(n).padStart(2,'0')}[0]`));if(value){f.setText(value);f.setFontSize(n>=11?14:10);}};
 text(1,data.name);text(2,data.business_name);text(3,data.classification==='llc'?data.llc_class:'');text(4,data.classification==='other'?data.other_class:'');text(5,data.exempt_payee);text(6,data.fatca);text(7,data.address);text(8,data.city_state_zip);text(9,'Turnly LLC');text(10,data.account_numbers);
 const category=['individual','c_corp','s_corp','partnership','trust','llc','other'].indexOf(data.classification);fields.find(f=>f.getName().endsWith(`.c1_1[${category}]`)).check();if(data.foreign_partners)fields.find(f=>f.getName().endsWith('.c1_2[0]')).check();
 if(data.tin_type==='ssn'){text(11,data.tin.slice(0,3));text(12,data.tin.slice(3,5));text(13,data.tin.slice(5));}else{text(14,data.tin.slice(0,2));text(15,data.tin.slice(2));}
 const font=await doc.embedFont(StandardFonts.HelveticaOblique),page=doc.getPages()[0];
 const sig=data.signature_name;let size;try{size=Math.min(11,255/font.widthOfTextAtSize(sig,1));}catch{throw S.fail('Please contact Turnly for assistance recording your signature in this character set.');}
 page.drawText(sig,{x:128,y:207,size,font,color:rgb(0.06,0.13,0.22)});page.drawText(new Date(signedAt).toISOString().slice(0,10),{x:440,y:207,size:10});
 if(data.backup_withholding){page.drawLine({start:{x:43,y:307},end:{x:575,y:307},thickness:.8});page.drawLine({start:{x:43,y:297},end:{x:575,y:297},thickness:.8});page.drawLine({start:{x:43,y:287},end:{x:213,y:287},thickness:.8});}
 const audit=doc.addPage([612,792]);audit.drawText('Electronic signature record',{x:48,y:740,size:18});
 for(const [i,line] of ['Form W-9 (Rev. March 2024)',`Signed by: ${sig}`,`Signed at: ${signedAt}`,'The signer reviewed the populated form and certification.',data.backup_withholding?'Certification item 2 was crossed out by the signer.':'Certification item 2 was not crossed out.','Electronic-record consent and signature were submitted in the authenticated portal.'].entries())audit.drawText(line,{x:48,y:700-i*24,size:10});
 for(const f of fields)if(f.constructor.name==='PDFCheckBox')f.updateAppearances();
 form.updateFieldAppearances();form.getFields().forEach(f=>f.enableReadOnly());return Buffer.from(await doc.save());
}
module.exports={normalize,w9Pdf,W9_VERSION,CERTIFICATION};
