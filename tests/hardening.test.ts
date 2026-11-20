import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Server } from 'node:http';
import express from 'express';
import { configureHttpSecurity } from '../server/httpSecurity';
import { isEvidenceUrl, isImageUrl } from '../server/evidenceUrl';

let directory: string;
let appServer: Server;
let base: string;
let store: typeof import('../server/db').db;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'marathon-hardening-'));
  process.env.MARATHON_JSON_PATH = path.join(directory, 'state.json');
  process.env.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = 'https://approved.example.test';
  const { default: auth } = await import('../server/routes/auth');
  const { default: teams } = await import('../server/routes/teams');
  store = (await import('../server/db')).db;
  const app = express();
  configureHttpSecurity(app);
  app.use(express.json());
  app.get('/api/check', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', auth);
  app.use('/api/teams', teams);
  await new Promise<void>((resolve) => { appServer = app.listen(0, '127.0.0.1', resolve); });
  const address = appServer.address();
  assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  appServer?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const password = 'Regression test password 26!';
const registration = (username: string) => ({
  username, email: `${username}@example.test`, password, bungieId: `${username}#1234`
});
const post = (route: string, body: object, token?: string) => fetch(base + route, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
  body: JSON.stringify(body)
});

test('production headers protect the app and API CORS permits exact origins', async () => {
  const same = await fetch(base + '/api/check', { headers: { Origin: base } });
  assert.equal(same.status, 200);
  assert.equal(same.headers.get('access-control-allow-origin'), null);
  assert.match(same.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
  assert.match(same.headers.get('content-security-policy')!, /connect-src 'self'/);
  assert.equal(same.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(same.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(same.headers.get('strict-transport-security'), null);
  const denied = await fetch(base + '/api/check', { headers: { Origin: 'https://unapproved.example.test' } });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  const preflight = await fetch(base + '/api/check', {
    method: 'OPTIONS',
    headers: { Origin: 'https://approved.example.test', 'Access-Control-Request-Method': 'GET' }
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://approved.example.test');
});

test('captain assignments persist across reload and login and stay scoped to their teams', async () => {
  const captain = await (await post('/api/auth/register', registration('RosterCaptain'))).json();
  const other = await (await post('/api/auth/register', registration('OtherCaptain'))).json();
  const create = await post('/api/teams', { name: 'Created team', tag: 'CT' }, captain.token);
  assert.equal(create.status, 201);
  const { team } = await create.json();
  const unrelated = await (await post('/api/teams', { name: 'Other team', tag: 'OT' }, other.token)).json();
  store.data = JSON.parse(await readFile(process.env.MARATHON_JSON_PATH!, 'utf8'));
  assert.equal(store.data.users.find((user) => user.id === captain.user.id)?.role, 'PLAYER');
  assert.equal(store.data.teamMembers.find((member) => member.teamId === team.id)?.role, 'CAPTAIN');
  const login = await post('/api/auth/login', { login: 'RosterCaptain', password });
  assert.equal(login.status, 200);
  const session = await login.json();
  const refresh = await fetch(base + '/api/auth/me', { headers: { Authorization: `Bearer ${session.token}` } });
  assert.equal(refresh.status, 200);
  const me = await refresh.json();
  assert.equal(me.teams[0].captainUserId, captain.user.id);
  assert.equal(me.user.passwordHash, undefined);
  assert.equal((await post(`/api/teams/${team.id}/invite`, { targetUserId: other.user.id }, session.token)).status, 200);
  assert.equal((await post(`/api/teams/${unrelated.team.id}/invite`, { targetUserId: other.user.id }, session.token)).status, 403);
});

test('authentication responses conceal duplicate field and suspended account details', async () => {
  const duplicateEmail = await post('/api/auth/register', { ...registration('AnotherName'), email: 'RosterCaptain@example.test' });
  const duplicateName = await post('/api/auth/register', { ...registration('RosterCaptain'), email: 'different@example.test' });
  assert.equal(duplicateEmail.status, 400);
  assert.deepEqual(await duplicateEmail.json(), await duplicateName.json());
  store.data.users.find((user) => user.username === 'OtherCaptain')!.accountStatus = 'SUSPENDED';
  const suspended = await post('/api/auth/login', { login: 'OtherCaptain', password });
  const missing = await post('/api/auth/login', { login: 'MissingAccount', password });
  assert.equal(suspended.status, 401);
  assert.equal(missing.status, 401);
  assert.deepEqual(await suspended.json(), await missing.json());
});

test('auth rate limits count requests across identities from the same IP', async () => {
  for (let attempt = 0; attempt < 27; attempt++) {
    assert.equal((await post('/api/auth/login', { login: `attempt-${attempt}`, password })).status, 401);
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    assert.equal((await post('/api/auth/register', {})).status, 400);
  }
  for (const route of ['login', 'register']) {
    const limited = await post(`/api/auth/${route}`, {});
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);
    assert.deepEqual(await limited.json(), { error: 'Too many requests. Please try again later.' });
  }
});

test('external URL validation rejects unsafe protocols, credentials, and oversized values', () => {
  assert.ok(isEvidenceUrl('http://example.test/vod'));
  assert.ok(isImageUrl(' https://example.test/logo '));
  for (const value of ['javascript:alert(1)', 'file:///tmp/a', 'data:text/html,test', 'https://user:pass@example.test', `https://example.test/${'a'.repeat(2048)}`]) {
    assert.equal(isEvidenceUrl(value), false);
    assert.equal(isImageUrl(value), false);
  }
  assert.equal(isImageUrl('http://example.test/logo'), false);
});

test('public event serialization discards fields outside routing metadata', async () => {
  const { setEventBroadcaster, broadcastEvent } = await import('../server/timerWorker');
  const seen: unknown[] = [];
  setEventBroadcaster((event, data) => seen.push([event, JSON.parse(JSON.stringify(data))]));
  try {
    const record = { matchId: 'match', tournamentId: 'tournament', passwordHash: 'secret', evidenceUrl: 'private', score: 35 };
    broadcastEvent('MATCH_UPDATED', record);
    assert.deepEqual(seen, [['MATCH_UPDATED', { matchId: 'match', tournamentId: 'tournament' }]]);
  } finally {
    setEventBroadcaster(() => {});
  }
});

test('SQLite requires explicit legacy import, rejects demo data, and retains bootstrap across restarts', () => {
  const run = (sqlite: string, extra: Record<string, string>, expression = 'assert.equal(db.data.users.length, 1)') =>
    spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
      `import assert from 'node:assert/strict'; import { db } from './server/db.ts'; ${expression}`], {
      env: { ...process.env, DEMO_MODE: 'false', MARATHON_IMPORT_LEGACY_JSON: 'false',
        MARATHON_SQLITE_PATH: sqlite ? path.join(directory, sqlite) : '', ...extra },
      encoding: 'utf8'
    });
  const boot = { BOOTSTRAP_ADMIN_EMAIL: 'bootstrap@example.test', BOOTSTRAP_ADMIN_PASSWORD: 'Unique-Bootstrap-46!Gh9Q' };
  const first = run('fresh.sqlite', boot, "assert.equal(db.data.users[0].role, 'SUPERADMIN'); assert.equal(db.data.users.length, 1)");
  assert.equal(first.status, 0, first.stderr);
  assert.ok(!first.stdout.includes(boot.BOOTSTRAP_ADMIN_PASSWORD));
  const second = run('fresh.sqlite', boot);
  assert.equal(second.status, 0, second.stderr);
  const rollback = run('fresh.sqlite', boot, `
    const { DatabaseSync } = await import('node:sqlite');
    const connection = new DatabaseSync(process.env.MARATHON_SQLITE_PATH);
    connection.exec("CREATE TRIGGER reject_snapshot BEFORE UPDATE ON tournament_state BEGIN SELECT RAISE(ABORT, 'test write failure'); END");
    db.data.users.length = 0;
    assert.throws(() => db.save(), /test write failure/);
    assert.equal(db.data.users.length, 1);
    connection.close();
  `);
  assert.equal(rollback.status, 0, rollback.stderr);
  const weak = run('weak.sqlite', { ...boot, BOOTSTRAP_ADMIN_PASSWORD: 'short' });
  assert.equal(weak.status, 1);
  assert.match(weak.stderr, /strong password/);
  const imported = run('imported.sqlite', { MARATHON_IMPORT_LEGACY_JSON: 'true' }, 'assert.equal(db.data.users.length, 2)');
  assert.equal(imported.status, 0, imported.stderr);
  const demoPath = path.join(directory, 'demo.json');
  const demo = run('', { DEMO_MODE: 'true', MARATHON_JSON_PATH: demoPath }, 'assert.equal(db.data.demo, true)');
  assert.equal(demo.status, 0, demo.stderr);
  const rejected = run('rejected.sqlite', { MARATHON_IMPORT_LEGACY_JSON: 'true', MARATHON_JSON_PATH: demoPath });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Demo database cannot be used/);
  const clean = run('rejected.sqlite', {}, 'assert.equal(db.data.users.length, 0)');
  assert.equal(clean.status, 0, clean.stderr);
});
