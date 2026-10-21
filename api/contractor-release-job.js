const S = require('../lib/residential-server.cjs');
const {uuid} = require('../lib/agent-referrals.cjs');

async function release(db, req, input) {
  const token = String(req.headers.authorization || '').match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw S.fail('Sign in to release a job.', 401);
  const auth = await db.auth.getUser(token);
  if (auth.error || !auth.data?.user) throw S.fail('Your session expired. Sign in again.', 401);
  if (!uuid(input.id)) throw S.fail('Choose a job.');
  const result = await db.rpc('release_contractor_job', {p_actor: auth.data.user.id, p_job: input.id});
  if (result.error) {
    if (result.error.code === 'P0001') throw S.fail(result.error.message, 409);
    throw S.fail('Unable to release this job. Please try again.', 503);
  }
  return {released: true};
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') return S.json(res, 405, {error: 'Method not allowed.'});
  try { return S.json(res, 200, await release(S.database(), req, await S.body(req))); }
  catch (error) { return S.json(res, error.status || 503, {error: error.status ? error.message : 'Unable to release this job.'}); }
};
module.exports.release = release;
