const code=new URL(location.href).searchParams.get('code')||location.pathname.split('/').pop();
if(/^BA-[A-Z0-9]{16}$/.test(code))location.replace('https://portal.turnlypros.com/residential-referral.html?ba='+encodeURIComponent(code));
else document.querySelector('#notice').textContent='Please use the complete referral link from your ambassador.';
