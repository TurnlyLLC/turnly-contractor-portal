export async function verifyHireEmail(client, entered, returnPage) {
  const email = String(entered || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /@(?:[\w-]+\.)*(?:indeed|indeedemail)\.com$/i.test(email)) {
    throw Error('Enter a personal email address you can access.');
  }
  const {data,error} = await client.auth.getUser();
  if (error || !data?.user) throw Error('Sign in again to continue.');
  const user = data.user;
  if (!user.new_email && user.email_confirmed_at && email === user.email?.toLowerCase()) return email;
  if (user.new_email?.toLowerCase() !== email) {
    const change = await client.auth.updateUser({email}, {emailRedirectTo:new URL(returnPage,location.origin).href});
    if (change.error) throw change.error;
  }
  throw Error('Check your email for the confirmation link(s), then return here and submit your new password. Your username still works.');
}
