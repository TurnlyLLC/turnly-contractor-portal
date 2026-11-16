const S = require('../lib/residential-server.cjs');
const V = require('../lib/owner-voice.cjs');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {const c=V.config();return S.json(res,200,{service:'Turnly private voice',ready:!!V.ready(c),twilio_account_matches:!!c.account&&c.account===c.expectedAccount});}
  if (req.method !== 'POST') return S.json(res, 405, {error: 'Use POST.'});
  const kind = req.query?.kind;
  if (!['incoming', 'callback', 'authorize', 'status', 'openai'].includes(kind)) return S.json(res, 404, {error: 'Not found.'});
  try {
    const chunks=[];let size=0;
    for await (const chunk of req) {const bytes=Buffer.from(chunk);size+=bytes.length;if(size>65536)throw S.fail('Request too large.',413);chunks.push(bytes);}
    const raw=Buffer.concat(chunks).toString('utf8');
    const c = V.config();
    if (kind === 'openai') {
      if (!V.verifyOpenAI(raw, req.headers, c.webhookSecret)) return S.json(res, 403, {error: 'Invalid signature.'});
      await V.openaiIncoming(S.database(), JSON.parse(raw), c);
      return S.json(res, 200, {ok: true});
    }
    const p = Object.fromEntries(new URLSearchParams(raw));
    if (!V.verifyTwilio(req, p, c)) return S.json(res, 403, {error: 'Invalid signature.'});
    const db = S.database();
    if (kind === 'status') { await V.completed(db, p, req.query.id); return S.json(res, 200, {ok: true}); }
    const body = kind === 'incoming' ? await V.incoming(db, p, c) : await V.callback(db, p, req.query.id, kind === 'authorize', c);
    res.setHeader('Content-Type', 'text/xml'); res.statusCode = 200; res.end(body);
  } catch (e) { return S.json(res, e.status || 503, {error: e.status ? e.message : 'Voice connection unavailable.'}); }
};
module.exports.config = {api: {bodyParser: false}};
