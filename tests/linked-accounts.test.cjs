const test = require('node:test');
const assert = require('node:assert/strict');
const {run} = require('../lib/linked-accounts.cjs');
const admin = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const contractor = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
function fixture(actor = admin) {
  const users = {
    [admin]: {id: admin, email: 'admin@example.com', app_metadata: {linked_contractor_id: contractor}},
    [contractor]: {id: contractor, email: 'contractor@example.com', email_confirmed_at: '2026-01-01', app_metadata: {linked_admin_id: admin}}
  };
  const profiles = {[admin]: {role: 'admin', status: 'active'}, [contractor]: {role: 'contractor', status: 'active'}};
  const calls = [];
  const db = {auth: {
    getUser: async token => token === 'valid' ? {data: {user: users[actor]}} : {error: true},
    admin: {
      getUserById: async id => ({data: {user: users[id]}}),
      generateLink: async input => { calls.push(input); return {data: {user: users[contractor], properties: {hashed_token: 'one-time'}}}; }
    }
  }, from: () => ({select: () => ({eq: (_, id) => ({maybeSingle: async () => ({data: profiles[id]})})})})};
  const verifier = {auth: {verifyOtp: async input => {calls.push(input); return {data: {session: {
    user: users[contractor], access_token: 'contractor-access', refresh_token: 'contractor-refresh'
  }}}; }}};
  return {db, verifier, users, profiles, calls};
}
test('linked admin receives only the existing contractor session, with no email sent', async () => {
  const f = fixture(); const result = await run(f.db, f.verifier, 'valid', 'contractor');
  assert.deepEqual(result, {session: {access_token: 'contractor-access', refresh_token: 'contractor-refresh'}, contractor_id: contractor});
  assert.deepEqual(f.calls, [{type: 'magiclink', email: 'contractor@example.com'}, {token_hash: 'one-time', type: 'email'}]);
});
test('contractor cannot mint admin or contractor sessions through the switch', async () => {
  const f = fixture(contractor);
  assert.equal((await run(f.db, f.verifier, 'valid', 'status')).view, 'contractor');
  await assert.rejects(run(f.db, f.verifier, 'valid', 'contractor'), /active linked admin/);
  await assert.rejects(run(f.db, f.verifier, 'valid', 'admin'), /supported/);
  assert.equal(f.calls.length, 0);
});
test('unauthenticated requests cannot read links or generate sessions', async () => {
  const f = fixture();
  await assert.rejects(run(f.db, f.verifier, '', 'status'), /Sign in/);
  await assert.rejects(run(f.db, f.verifier, 'invalid', 'contractor'), /expired/);
  assert.equal(f.calls.length, 0);
});
test('user-editable metadata grants no access', async () => {
  const f = fixture(); f.users[admin].user_metadata = f.users[admin].app_metadata; f.users[admin].app_metadata = {};
  assert.equal((await run(f.db, f.verifier, 'valid', 'status')).linked, false);
  await assert.rejects(run(f.db, f.verifier, 'valid', 'contractor'), /active linked admin/);
});
test('reciprocal links and active roles are required', async () => {
  for (const mutate of [f => { f.users[contractor].app_metadata = {}; }, f => { f.profiles[admin].status = 'disabled'; },
    f => { f.profiles[contractor].role = 'admin'; }, f => { f.profiles[contractor].status = 'inactive'; },
    f => { f.users[contractor].banned_until = '2999-01-01'; }]) {
    const f = fixture(); mutate(f);
    await assert.rejects(run(f.db, f.verifier, 'valid', 'contractor'));
    assert.equal(f.calls.length, 0);
  }
});
test('unverified email and mismatched generated user fail closed', async () => {
  const f = fixture(); delete f.users[contractor].email_confirmed_at;
  await assert.rejects(run(f.db, f.verifier, 'valid', 'contractor'), /verified/);
  f.users[contractor].email_confirmed_at = '2026-01-01';
  f.db.auth.admin.generateLink = async () => ({data: {user: {id: admin}, properties: {hashed_token: 'bad'}}});
  await assert.rejects(run(f.db, f.verifier, 'valid', 'contractor'), /Unable/);
  assert.equal(f.calls.length, 0);
});
test('verification cannot return the wrong identity', async () => {
  const f = fixture(); f.verifier.auth.verifyOtp = async () => ({data: {session: {user: {id: admin}, access_token: 'wrong'}}});
  await assert.rejects(run(f.db, f.verifier, 'valid', 'contractor'), /Unable/);
});
