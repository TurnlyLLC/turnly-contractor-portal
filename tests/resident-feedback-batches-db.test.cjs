// Run with @electric-sql/pglite available on NODE_PATH. Never contacts production.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const hash = value => createHash('sha256').update(value).digest('hex');

test('legacy batches, atomic ream creation, deletion, number reuse and access controls', async () => {
  const db = new PGlite();
  const property = randomUUID(), admin = randomUUID(), batch = randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.portal_properties(id uuid primary key, name text, property_name text);
      create function public.current_profile_is_admin() returns boolean language sql as 'select false';
      create schema extensions;
      create function extensions.digest(text,text) returns bytea language sql as 'select sha256(convert_to($1, ''UTF8''))';
      grant usage on schema public, auth, extensions to service_role;
      grant select on public.portal_properties to service_role;`);
    const old = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260918100000_resident_feedback_qr.sql'), 'utf8').replace('create extension if not exists pgcrypto;', '');
    await db.exec(old);
    await db.query('insert into auth.users values ($1)', [admin]);
    await db.query("insert into public.portal_properties values ($1, 'Vetra Forest Hills', null)", [property]);
    const legacyInsert = `insert into public.resident_feedback_cards(portal_property_id,property_name,property_code,card_number,token_hash,created_by)
      select $1, 'Vetra Forest Hills', 'OLD', i, lpad(i::text,64,'0'), $2 from generate_series(1,5) i`;
    await db.query(legacyInsert, [property, admin]);
    const card = (await db.query('select id from public.resident_feedback_cards where card_number=1')).rows[0];
    await db.query("insert into public.resident_feedback_responses(request_id,card_id,property_name,property_code,card_number,rating) values ($1,$2,'Vetra Forest Hills','OLD',1,5)", [randomUUID(), card.id]);
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260921114448_resident_feedback_batch_management.sql'), 'utf8'));
    const legacy = (await db.query('select * from public.resident_feedback_batches')).rows;
    assert.equal(legacy.length, 1);
    assert.equal(legacy[0].card_count, 5);
    assert.equal((await db.query('select count(*)::int as n from public.resident_feedback_cards where batch_id is null')).rows[0].n, 0);
    // Old deployment can still create correctly grouped batches during rollout.
    await db.exec('set role service_role');
    await db.query(legacyInsert.replace("'OLD'", "'LEGACY'").replace("lpad(i::text,64,'0')", "lpad((i+20)::text,64,'0')"), [property, admin]);
    assert.equal((await db.query("select card_count from public.resident_feedback_batches where property_code='LEGACY'")).rows[0].card_count, 5);
    const tokens = Array.from({length:2000}, (_,i) => (i+100).toString(16).padStart(64,'0'));
    const create = 'select public.create_resident_feedback_batch($1,$2,$3,$4,$5,$6) as result';
    const result = await db.query(create, [batch,property,'VFH',1,tokens.map(hash),admin]);
    assert.equal(result.rows[0].result.card_count,2000);
    assert.equal((await db.query('select count(*)::int as n from public.resident_feedback_cards where batch_id=$1',[batch])).rows[0].n,2000);
    assert.equal((await db.query('select resolve_resident_feedback_card($1) as valid',[tokens[1999]])).rows[0].valid,true);
    // A conflicting number rolls back the new batch AND every card.
    const collision = randomUUID();
    await assert.rejects(db.query(create,[collision,property,'VFH',2000,[hash('collision-1'),hash('collision-2')],admin]), /duplicate key/);
    assert.equal((await db.query('select count(*)::int as n from public.resident_feedback_batches where id=$1',[collision])).rows[0].n,0);
    await assert.rejects(db.query(create,[randomUUID(),property,'LIMIT',1,Array(2001).fill(hash('x')),admin]), /invalid_feedback_batch/);
    await db.query('select submit_resident_feedback($1,$2,5::smallint,$3)', [tokens[0],randomUUID(),'Keep this feedback']);
    await db.query('select delete_resident_feedback_batch($1)',[batch]);
    assert.equal((await db.query('select resolve_resident_feedback_card($1) as valid',[tokens[0]])).rows[0].valid,false);
    assert.equal((await db.query('select count(*)::int as n from public.resident_feedback_cards where batch_id=$1',[batch])).rows[0].n,0);
    assert.equal((await db.query("select count(*)::int as n from public.resident_feedback_cards where property_code='OLD'")).rows[0].n,5);
    const feedback = (await db.query("select * from public.resident_feedback_responses where message='Keep this feedback'")).rows[0];
    assert.equal(feedback.card_id,null);
    assert.equal(feedback.property_code,'VFH');
    assert.equal(feedback.card_number,1);
    await db.query(create,[randomUUID(),property,'VFH',1,[hash('replacement')],admin]);
    await db.query('select delete_resident_feedback_batch($1)',[legacy[0].id]);
    assert.equal((await db.query("select card_id from public.resident_feedback_responses where property_code='OLD'")).rows[0].card_id,null);
    assert.equal((await db.query('select delete_resident_feedback_batch($1) as deleted',[legacy[0].id])).rows[0].deleted,null);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.query('select delete_resident_feedback_batch($1)',[batch]), /permission denied/);
    await assert.rejects(db.query(create,[randomUUID(),property,'DENY',1,[hash('deny')],admin]), /permission denied/);
    await assert.rejects(db.query('select * from public.resident_feedback_batches'), /permission denied/);
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query('select delete_resident_feedback_batch($1)',[batch]), /permission denied/);
  } finally { await db.close(); }
});
