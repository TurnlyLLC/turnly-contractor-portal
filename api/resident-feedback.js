const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { residentFeedbackErrorMessage, validateResidentFeedbackRequest } = require('./resident-feedback-validation');

const allowedOrigins = new Set(['https://turnlypros.com', 'https://www.turnlypros.com', 'https://portal.turnlypros.com', 'https://turnlyllc.github.io', 'http://localhost:4173', 'http://localhost:5500', 'http://127.0.0.1:5500']);
const allowedAdminRoles = new Set(['admin', 'owner', 'super_admin']);

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://nwnzdoveskthebfyndcs.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return { error: true };
  return { client: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) };
}

function bearerToken(req) {
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function normalizeRole(value) { return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_'); }

async function requireAdmin(client, req) {
  const token = bearerToken(req);
  if (!token) return { error: 'Sign in with an admin account to manage QR batches.', status: 401 };
  const { data, error } = await client.auth.getUser(token);
  const user = data?.user;
  if (error || !user) return { error: 'Your admin session has expired. Sign in and try again.', status: 401 };
  if (allowedAdminRoles.has(normalizeRole(user.app_metadata?.role))) return { user };
  const profile = await client.from('profiles').select('id,role').eq('id', user.id).maybeSingle();
  if (profile.error) return { error: 'Unable to verify admin access. Please retry.', status: 503 };
  if (!allowedAdminRoles.has(normalizeRole(profile.data?.role))) return { error: 'Only an admin can manage resident QR batches.', status: 403 };
  return { user };
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
}

function tokenHash(token) { return createHash('sha256').update(token, 'utf8').digest('hex'); }

module.exports = async function handler(req, res) {
  const origin = String(req.headers.origin || '');
  res.setHeader('Vary', 'Origin');
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (!allowedOrigins.has(origin)) return sendJson(res, 403, { error: 'This request must come from a Turnly page.' });
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); return sendJson(res, 405, { error: 'Method not allowed.' }); }
  if (!String(req.headers['content-type'] || '').includes('application/json')) return sendJson(res, 415, { error: 'Use JSON.' });

  let input;
  try { input = parseBody(req); }
  catch { return sendJson(res, 400, { error: 'Please check the feedback details.' }); }
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 16000) return sendJson(res, 413, { error: 'Feedback is too large.' });
  let request;
  try { request = validateResidentFeedbackRequest(input); }
  catch (error) { return sendJson(res, 400, { error: error.message }); }
  if (request.action === 'submit' && request.honeypot) return sendJson(res, 200, { ok: true });

  const admin = getSupabaseAdmin();
  if (admin.error) return sendJson(res, 503, { error: 'The feedback service is unavailable.' });
  const client = admin.client;

  try {
    if (['create_batch', 'list_batches', 'delete_batch'].includes(request.action)) {
      const access = await requireAdmin(client, req);
      if (access.error) return sendJson(res, access.status || 403, { error: access.error });

      if (request.action === 'list_batches') {
        const pageSize = 20;
        const start = (request.page - 1) * pageSize;
        const result = await client.from('resident_feedback_batches')
          .select('id,property_name,property_code,start_number,end_number,card_count,created_at', { count: 'exact' })
          .order('created_at', { ascending: false }).order('id', { ascending: false }).range(start, start + pageSize - 1);
        if (result.error) return sendJson(res, 503, { error: 'Unable to load saved batches. Please retry.' });
        return sendJson(res, 200, { ok: true, batches: result.data || [], page: request.page, total: result.count || 0, page_size: pageSize });
      }

      if (request.action === 'delete_batch') {
        const result = await client.rpc('delete_resident_feedback_batch', { p_batch_id: request.batch_id });
        if (result.error) {
          console.error('Resident feedback batch deletion failed', { code: result.error.code || 'unknown' });
          return sendJson(res, 503, { error: 'Unable to delete this batch. No partial deletion was saved. Please retry.' });
        }
        if (!result.data) return sendJson(res, 404, { error: 'This batch has already been deleted. Refresh the batch list.' });
        return sendJson(res, 200, { ok: true, deleted: result.data });
      }

      const propertyResult = await client.from('portal_properties').select('id,name,property_name').eq('id', request.property_id).maybeSingle();
      const property = propertyResult.data;
      if (propertyResult.error || !property) return sendJson(res, 400, { error: 'Choose an existing property and try again.' });
      const propertyName = String(property.property_name || property.name || '').trim();
      if (!propertyName) return sendJson(res, 400, { error: 'That property needs a name before QR cards can be created.' });

      const batchId = randomUUID();
      const cards = Array.from({ length: request.count }, (_, index) => {
        const token = randomBytes(32).toString('hex');
        const card_number = request.start_number + index;
        return {
          token,
          card_number,
          token_hash: tokenHash(token),
          feedback_url: `https://turnlypros.com/f/${token}`
        };
      });
      // A single database transaction saves the batch and all 2,000 cards.
      // Return scalar metadata, avoiding PostgREST's default 1,000-row response cap.
      const insert = await client.rpc('create_resident_feedback_batch', {
        p_batch_id: batchId, p_property_id: property.id, p_property_code: request.property_code,
        p_start_number: request.start_number, p_token_hashes: cards.map(card => card.token_hash), p_created_by: access.user.id
      });
      if (insert.error) {
        if (insert.error.code === '23505') return sendJson(res, 409, { error: residentFeedbackErrorMessage(insert.error.message) });
        console.error('Resident feedback batch save failed', { code: insert.error.code || 'unknown' });
        return sendJson(res, 503, { error: 'Unable to save this QR batch. Apply the resident feedback migration and retry.' });
      }
      return sendJson(res, 200, { ok: true, batch_id: batchId, property_name: insert.data?.property_name || propertyName, property_code: request.property_code,
        cards: cards.map(card => ({ card_number: card.card_number, feedback_url: card.feedback_url })) });
    }

    if (request.action === 'resolve') {
      const result = await client.rpc('resolve_resident_feedback_card', { p_token: request.token });
      if (result.error) {
        console.error('Resident feedback link check failed', { code: result.error.code || 'unknown' });
        return sendJson(res, 503, { error: 'We could not check this QR card. Please try again.' });
      }
      return sendJson(res, 200, { valid: result.data === true });
    }

    const result = await client.rpc('submit_resident_feedback', {
      p_token: request.token, p_request_id: request.request_id, p_rating: request.rating, p_message: request.message
    });
    if (result.error) {
      const mapped = residentFeedbackErrorMessage(result.error.message);
      if (String(result.error.message).includes('invalid_feedback_card')) return sendJson(res, 404, { error: mapped });
      if (String(result.error.message).includes('feedback_rate_limited')) return sendJson(res, 429, { error: mapped });
      if (String(result.error.message).includes('invalid_feedback_rating') || String(result.error.message).includes('feedback_message_too_long')) return sendJson(res, 400, { error: mapped });
      console.error('Resident feedback save failed', { code: result.error.code || 'unknown' });
      return sendJson(res, 503, { error: 'We could not save your feedback. Please try again.' });
    }
    return sendJson(res, 200, { ok: true });
  } catch {
    return sendJson(res, 503, { error: 'The feedback service is unavailable. Please try again.' });
  }
};
