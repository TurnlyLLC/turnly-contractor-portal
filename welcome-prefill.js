(async function fillWelcomeForm(){
  const fragment=new URLSearchParams(location.hash.slice(1));
  if(!fragment.has('welcome')) return;
  const token=fragment.get('welcome');
  history.replaceState(history.state,'',location.pathname+location.search);
  const username=document.getElementById('loginEmail');
  const password=document.getElementById('loginPassword');
  const message=document.getElementById('authMessage');
  const button=username.form.querySelector('button[type=submit]');
  button.disabled=true;
  try {
    const response=await fetch('/api/welcome-prefill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store'});
    const data=await response.json();
    if(!response.ok) throw Error(data.error);
    username.value=data.username;
    password.value=data.password;
    message.textContent='Your sign-in details are ready. Select Sign in to continue.';
  } catch(error) {message.textContent=error.message||'Enter the credentials from your welcome email.';}
  finally {button.disabled=false;}
})();
