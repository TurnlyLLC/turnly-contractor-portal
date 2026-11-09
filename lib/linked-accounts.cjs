const fail = (message, status = 403) => Object.assign(new Error(message), {status});
const uuid = value => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value || '');

async function identity(db, id) {
  const [auth, profile] = await Promise.all([
    db.auth.admin.getUserById(id),
    db.from('profiles').select('id,email,full_name,role,status').eq('id', id).maybeSingle()
  ]);
  const user = auth.data?.user;
  if (auth.error || profile.error || !user || !profile.data || user.deleted_at ||
      (user.banned_until && Date.parse(user.banned_until) > Date.now()) || profile.data.status !== 'active') {
    throw fail('This linked account is unavailable. Contact Turnly.');
  }
  return {user, profile: profile.data};
}

async function linkedAccount(db, token) {
  if (!token) throw fail('Sign in to continue.', 401);
  const verified = await db.auth.getUser(token);
  if (verified.error || !verified.data?.user) throw fail('Your session expired. Sign in again.', 401);
  // Fetch current server-controlled metadata, never user_metadata or stale JWT claims.
  const actor = await identity(db, verified.data.user.id);
  const adminView = actor.profile.role === 'admin';
  const otherId = actor.user.app_metadata?.[adminView ? 'linked_contractor_id' : 'linked_admin_id'];
  if (!uuid(otherId) || otherId === actor.user.id) return {actor, linked: null};
  const other = await identity(db, otherId);
  const admin = adminView ? actor : other;
  const contractor = adminView ? other : actor;
  if (admin.profile.role !== 'admin' || contractor.profile.role !== 'contractor' ||
      admin.user.app_metadata?.linked_contractor_id !== contractor.user.id ||
      contractor.user.app_metadata?.linked_admin_id !== admin.user.id) {
    throw fail('The account link needs to be reviewed by Turnly.');
  }
  return {actor, linked: {admin, contractor}, view: adminView ? 'admin' : 'contractor'};
}

async function run(db, verifier, token, action) {
  const context = await linkedAccount(db, token);
  if (action === 'status') return {
    linked: !!context.linked, view: context.view || context.actor.profile.role,
    admin_id: context.linked?.admin.user.id,
    contractor_id: context.linked?.contractor.user.id,
    contractor_name: context.linked?.contractor.profile.full_name,
    contractor_email: context.linked?.contractor.user.email
  };
  if (action !== 'contractor') throw fail('Choose a supported account action.', 400);
  if (!context.linked || context.view !== 'admin') throw fail('An active linked admin session is required.');
  const target = context.linked.contractor.user;
  if (!target.email || !target.email_confirmed_at) throw fail('The contractor email must be verified first.');
  // No arbitrary target ID is accepted. generateLink does not send an email.
  const link = await db.auth.admin.generateLink({type: 'magiclink', email: target.email});
  if (link.error || link.data?.user?.id !== target.id || !link.data?.properties?.hashed_token) {
    throw fail('Unable to open your contractor account. Please retry.', 503);
  }
  // A separate nonpersistent client avoids replacing the service client's auth.
  const result = await verifier.auth.verifyOtp({token_hash: link.data.properties.hashed_token, type: 'email'});
  const session = result.data?.session;
  if (result.error || session?.user?.id !== target.id) throw fail('Unable to open your contractor session. Please retry.', 503);
  return {session: {access_token: session.access_token, refresh_token: session.refresh_token}, contractor_id: target.id};
}
module.exports = {run, linkedAccount};
