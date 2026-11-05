const QRCode=require('qrcode');
async function sharingAssets(member){
 if(!member?.referrals_ready)return null;
 if(!/^BA-[A-Z0-9]{16}$/.test(member.code))throw new Error('Invalid ambassador referral code.');
 const url='https://client.turnlypros.com/residential-referral.html?ba='+member.code;
 return {url,qr:await QRCode.toDataURL(url,{errorCorrectionLevel:'M',margin:4,width:720})};
}
module.exports={sharingAssets};
