export const SIZE=1254;
export const CTA={x:327,y:1080,width:600,height:78};
export function drawPromo(c,{background,logo,qr}){
 const navy='#052b4c',teal='#00bdb2';
 c.drawImage(background,0,0,SIZE,SIZE);
 const wash=c.createLinearGradient(0,830,0,SIZE);wash.addColorStop(0,'rgba(255,255,255,0)');wash.addColorStop(.35,'rgba(246,251,255,.91)');wash.addColorStop(1,'rgba(246,251,255,.98)');c.fillStyle=wash;c.fillRect(0,830,SIZE,424);
 c.fillStyle=teal;c.beginPath();c.moveTo(925,0);c.bezierCurveTo(1090,70,1165,110,1254,205);c.lineTo(1254,0);c.fill();
 c.fillStyle='#04527a';c.beginPath();c.moveTo(1015,0);c.bezierCurveTo(1135,70,1200,130,1254,205);c.lineTo(1254,0);c.fill();
 c.fillStyle=teal;c.beginPath();c.moveTo(0,1125);c.quadraticCurveTo(120,1215,310,1254);c.lineTo(0,1254);c.fill();
 c.fillStyle='#04527a';c.beginPath();c.moveTo(0,1145);c.quadraticCurveTo(100,1220,265,1254);c.lineTo(0,1254);c.fill();
 c.fillStyle=teal;c.beginPath();c.moveTo(1254,1125);c.quadraticCurveTo(1134,1215,944,1254);c.lineTo(1254,1254);c.fill();
 c.drawImage(logo,375,38,120,120);
 c.fillStyle=navy;c.textAlign='left';c.font='bold 100px Arial';c.fillText('Turnly',516,136);
 c.textAlign='center';c.font='bold 20px Arial';c.fillText('PROFESSIONAL CLEANING SERVICES',627,188);
 c.font='bold 88px Arial';c.fillText('Scan to Book',627,276);c.fillText('Your Clean',627,360);
 c.strokeStyle=teal;c.lineWidth=7;c.lineCap='round';c.beginPath();c.moveTo(455,382);c.quadraticCurveTo(627,361,799,382);c.stroke();
 c.save();c.shadowColor='rgba(5,43,76,.22)';c.shadowBlur=28;c.shadowOffsetY=14;c.fillStyle='white';c.beginPath();c.roundRect(377,404,500,480,30);c.fill();c.restore();
 // Keep the actual QR intact, including its white quiet zone. Never put a logo over its modules.
 c.imageSmoothingEnabled=false;c.drawImage(qr,407,424,440,440);c.imageSmoothingEnabled=true;
 c.fillStyle=navy;c.font='italic 30px Arial';c.fillText('Fast booking. Trusted cleaners. Professional results.',627,929);
 const services=[['Residential','Cleaning'],['Move-Out','Cleans'],['Recurring','Service']];
 services.forEach((lines,i)=>{const x=112+i*347;c.fillStyle='rgba(255,255,255,.95)';c.beginPath();c.roundRect(x,963,336,86,43);c.fill();c.strokeStyle='#d0ebed';c.lineWidth=2;c.stroke();c.fillStyle=teal;c.beginPath();c.arc(x+41,1006,21,0,Math.PI*2);c.fill();c.strokeStyle='white';c.lineWidth=4;c.beginPath();c.moveTo(x+31,1006);c.lineTo(x+39,1014);c.lineTo(x+53,998);c.stroke();c.fillStyle=navy;c.textAlign='left';c.font='bold 27px Arial';c.fillText(lines[0],x+78,998);c.fillText(lines[1],x+78,1028);});
 c.fillStyle='#04527a';c.beginPath();c.roundRect(CTA.x,CTA.y,CTA.width,CTA.height,39);c.fill();c.fillStyle='white';c.textAlign='center';c.font='bold 43px Arial';c.fillText('Book your clean →',627,1133);
 c.fillStyle=navy;c.font='italic 24px Arial';c.fillText('Book with my personal referral link or scan above',627,1193);
 c.font='18px Arial';c.fillText('I may earn a referral commission. Service availability confirmed during booking.',627,1229);
}
export async function createPromoPdf(png,url,PDFLib){
 const target=new URL(url);
 if(target.origin!=='https://client.turnlypros.com'||target.pathname!=='/residential-referral.html'||!/^BA-[A-Z0-9]{16}$/.test(target.searchParams.get('ba')||''))throw new Error('Invalid ambassador booking link.');
 const {PDFDocument,PDFName,PDFString}=PDFLib,doc=await PDFDocument.create();
 doc.setTitle('Turnly — book your clean');const page=doc.addPage([SIZE,SIZE]);
 page.drawImage(await doc.embedPng(png),{x:0,y:0,width:SIZE,height:SIZE});
 const annotation=doc.context.register(doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[CTA.x,SIZE-CTA.y-CTA.height,CTA.x+CTA.width,SIZE-CTA.y],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(url)}}));
 page.node.set(PDFName.of('Annots'),doc.context.obj([annotation]));return doc.save();
}
