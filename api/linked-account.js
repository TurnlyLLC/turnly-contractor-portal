const {createClient} = require('@supabase/supabase-js');
const {run} = require('../lib/linked-accounts.cjs');

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, {error: 'Use POST.'}); }
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SECRET_KEY;
    if (!key) throw Object.assign(new Error('Account switching is not configured.'), {status: 503});
    const url = process.env.SUPABASE_URL || 'https://nwnzdoveskthebfyndcs.supabase.co';
    const options = {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}};
    const db = createClient(url, key, options);
    const verifier = createClient(url, key, options);
    const token = String(req.headers.authorization || '').match(/^Bearer (.+)$/i)?.[1];
    let input = req.body || '';
    if (!input) for await (const part of req) { input += part.toString(); if (input.length > 1024) throw Object.assign(new Error('Request too large.'), {status: 400}); }
    if (typeof input === 'string') input = JSON.parse(input || '{}');
    return send(200, await run(db, verifier, token, input.action));
  } catch (error) {
    return send(error.status || 500, {error: error.status ? error.message : 'Unable to switch accounts. Please retry.'});
  }
};
