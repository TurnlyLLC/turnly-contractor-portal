const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../lib/crm-call-hours.cjs');

test('Eastern calling windows include opening and exclude closing, across DST', () => {
  for (const [date, allowed] of [
    ['2026-11-06T12:59:59Z', false],
    ['2026-11-06T13:00:00Z', true],
    ['2026-11-07T00:59:59Z', true],
    ['2026-11-07T01:00:00Z', false],
    ['2026-11-07T13:00:00Z', true],
    ['2026-11-07T21:59:59Z', true],
    ['2026-11-07T22:00:00Z', false],
    ['2026-11-08T17:00:00Z', false],
    ['2026-07-06T11:59:59Z', false],
    ['2026-07-06T12:00:00Z', true],
    ['2026-07-07T00:00:00Z', false],
    ['2026-11-07T05:00:00Z', false]
  ]) assert.equal(H.status(new Date(date)).allowed, allowed, date);
});

test('closed hours reject preparation and stop a previously prepared intent before dialing', async () => {
  const V = require('../lib/crm-voice.cjs');
  const C = require('../lib/crm-sales.cjs');
  const T = require('../lib/crm-training.cjs');
  const previous = { hours: H.status, lead: C.leadFor, training: T.requireComplete };
  const env = { ...process.env };
  const calls = [];
  const db = {
    async rpc(name, params) {
      calls.push([name, params]);
      return { data: { user_id: 'rep', lead_id: 'lead', phone: '+19195550101' } };
    },
    from() {
      return {
        select() { return this; }, update() { return this; },
        eq() { return this; },
        async single() { return { data: { max_seconds: 60 } }; },
        then(resolve) { resolve({ data: [] }); }
      };
    }
  };
  try {
    H.status = () => ({ allowed: false, message: 'Outside calling hours' });
    await assert.rejects(V.prepare(db, {}, {}, {}), { status: 403 });
    assert.equal(calls.length, 0);
    Object.assign(process.env, {
      TWILIO_VOICE_ENABLED: 'true', TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'test',
      TWILIO_API_KEY_SID: 'SKtest', TWILIO_API_KEY_SECRET: 'test',
      TWILIO_TWIML_APP_SID: 'APtest', TWILIO_VOICE_NUMBER: '+19195550100'
    });
    T.requireComplete = async () => {};
    C.leadFor = async () => ({ contact_phone: '+19195550101' });
    const xml = await V.connect(db, {
      Intent: '00000000-0000-4000-8000-000000000001', CallSid: 'CA' + 'a'.repeat(32), From: 'client:sales_rep'
    });
    assert.match(xml, /<Hangup/);
    assert.doesNotMatch(xml, /<Dial/);
    const settlement = calls.find(([name]) => name === 'communication_settle');
    assert.equal(settlement[1].p_release, true);
  } finally {
    H.status = previous.hours;
    C.leadFor = previous.lead;
    T.requireComplete = previous.training;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key];
    Object.assign(process.env, env);
  }
});
