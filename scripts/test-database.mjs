import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Disposable local PostgreSQL only. Never contacts the production Supabase project.
const db = new PGlite();
const admin = '11111111-1111-4111-8111-111111111111';
const member = '22222222-2222-4222-8222-222222222222';
let passed = 0;
async function check(name, action) {
  await action(); passed++; console.log(`OK ${passed}: ${name}`);
}
async function asUser(id, action) {
  await db.exec('set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  try { return await action(); } finally { await db.exec('reset role'); }
}
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  for (const name of (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort()) {
    await check(`migration ${name}`, () => readFile(`supabase/migrations/${name}`, 'utf8').then(sql => db.exec(sql)));
  }
  await db.query('insert into auth.users(id) values ($1), ($2)', [admin, member]);
  await db.query('insert into public.app_admins(user_id) values ($1)', [admin]);
  await check('ordinary user cannot grant administrator privileges', () => asUser(member, () =>
    assert.rejects(db.query('insert into public.app_admins(user_id) values ($1)', [member]), /permission denied/)));
  await check('ordinary user cannot read dashboard', () => asUser(member, () =>
    assert.rejects(db.query('select public.admin_dashboard()'), /Administrator access required/)));
  await check('ordinary user cannot read or forge journal', () => asUser(member, async () => {
    await assert.rejects(db.query('select * from public.admin_events'), /permission denied/);
    await assert.rejects(db.query("insert into public.admin_events(kind) values ('account_created')"), /permission denied/);
  }));
  await check('anonymous caller cannot read dashboard', async () => {
    await db.exec('set role anon');
    try { await assert.rejects(db.query('select public.admin_dashboard()'), /permission denied/); }
    finally { await db.exec('reset role'); }
  });
  await check('administrator sees accurate counters and account events', () => asUser(admin, async () => {
    const { rows } = await db.query('select public.admin_dashboard() as dashboard');
    assert.equal(rows[0].dashboard.accounts, 2);
    assert.equal(rows[0].dashboard.profiles, 0);
    assert.equal(rows[0].dashboard.events.length, 2);
    assert(rows[0].dashboard.events.every(event => event.kind === 'account_created'));
    assert(rows[0].dashboard.events.every(event => !('email' in event) && !('body' in event)));
  }));
  await check('publication, join and leave events are recorded', async () => {
    await asUser(admin, () => db.query(`insert into public.community_rides
      (id,organizer_id,title,ride_date,ride_time,departure,ride_type,distance,level,max_participants,description)
      values ('ride-test',$1,'Test','01/01/2030','10:00','Meynes','Route','10','Tous niveaux',2,'Test')`, [admin]));
    await asUser(member, () => db.query("insert into public.ride_participants(ride_id,user_id) values ('ride-test',$1)", [member]));
    await asUser(admin, async () => {
      const { rows } = await db.query('select public.admin_dashboard() as dashboard');
      assert.equal(rows[0].dashboard.rides, 1);
      assert.equal(rows[0].dashboard.participants, 1);
      assert(rows[0].dashboard.events.some(event => event.kind === 'ride_joined'));
    });
    await asUser(member, () => db.query("delete from public.ride_participants where ride_id='ride-test'"));
    await asUser(admin, async () => {
      const { rows } = await db.query('select public.admin_dashboard() as dashboard');
      assert.equal(rows[0].dashboard.participants, 0);
      assert(rows[0].dashboard.events.some(event => event.kind === 'ride_left'));
    });
  });
  await check('members cannot modify another organizer’s ride', async () => {
    const result = await asUser(member, () => db.query("update public.community_rides set title='Changed' where id='ride-test' returning id"));
    assert.equal(result.rows.length, 0);
  });
  await check('revocation takes effect on the next server request', async () => {
    await db.query('delete from public.app_admins where user_id=$1', [admin]);
    await asUser(admin, () => assert.rejects(db.query('select public.admin_dashboard()'), /Administrator access required/));
  });
  console.log(`${passed} database tests passed. Production untouched.`);
} finally { await db.close(); }
