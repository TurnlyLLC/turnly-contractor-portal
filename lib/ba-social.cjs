const {PNG}=require('pngjs'),QR=require('qrcode'),fs=require('node:fs'),path=require('node:path');
const valid=code=>typeof code==='string'&&/^BA-[A-Z0-9]{16}$/.test(code);
const booking=code=>'https://client.turnlypros.com/residential-referral.html?ba='+code;
const shareUrl=code=>'https://ba.turnlypros.com/api/ba-share?code='+code;
async function image(code){
 if(!valid(code))throw new Error('Invalid referral code');
 const template=PNG.sync.read(fs.readFileSync(path.join(__dirname,'../assets/ba-social-template.png')));
 const qr=PNG.sync.read(await QR.toBuffer(booking(code),{width:440,margin:4,errorCorrectionLevel:'M'}));
 PNG.bitblt(qr,template,0,0,440,440,407,424);return PNG.sync.write(template);
}
function page(code){
 if(!valid(code))throw new Error('Invalid referral code');
 const url=shareUrl(code),img=url+'&amp;image=1',link=booking(code);
 const title='Book your first Turnly clean',description='Residential, move-out and recurring cleaning. Book through this ambassador’s personal link. The ambassador may earn a referral commission. Service availability confirmed during booking.';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta property="og:type" content="website"><meta property="og:site_name" content="Turnly Residential"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${img}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1254"><meta property="og:image:height" content="1254"><meta property="og:image:alt" content="Turnly cleaning flyer with this ambassador’s booking QR code"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"><meta name="twitter:image" content="${img}"><meta name="robots" content="noindex"><style>body{margin:0;background:#eff8fa;font:18px Arial;color:#052b4c}main{max-width:680px;margin:24px auto;padding:20px;text-align:center}img{width:100%;border-radius:20px}a.cta{display:block;background:#04527a;color:white;border-radius:40px;padding:20px;text-decoration:none;font-weight:bold;margin:18px 0}p{line-height:1.6}</style></head><body><main><h1>${title}</h1><a class="cta" href="${link}">Book your clean →</a><a href="${link}" aria-label="Book through this ambassador’s referral link"><img src="${img}" alt="Turnly flyer with your ambassador’s booking QR code"></a><p>${description}</p><a class="cta" href="${link}">Check availability &amp; book →</a></main></body></html>`;
}
module.exports={valid,booking,shareUrl,image,page};
