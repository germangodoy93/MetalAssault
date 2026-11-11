'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FileStore } = require('../store');
const { createPlayers, hashSecret, verifySecret, normTag } = require('../players');

const ADMIN = 'test-admin-key';
async function setup(env = { SESSION_SECRET: 'test', ADMIN_KEY: ADMIN }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ma-players-'));
  const store = new FileStore(dir);
  await store.init();
  await store.applyBatch([{ op: 'set', col: 'tournaments', id: 't1', data: { name: 'Copa', status: 'abierto', maxPlayers: 2 } }]);
  return { store, players: createPlayers(store, env) };
}
const IP = '1.2.3.4';
const rejects = (p, status) => assert.rejects(p, (e) => e.status === status);

test('secrets are salted hashes', () => {
  const h = hashSecret('1234');
  assert.ok(verifySecret('1234', h));
  assert.ok(!verifySecret('1235', h));
  assert.notEqual(h, hashSecret('1234'));
});

test('admin key comes from ADMIN_KEY and is rate limited per IP', async () => {
  const { players } = await setup();
  assert.equal(players.adminConfigured, true);
  assert.equal(players.checkAdmin(ADMIN, IP), true);
  assert.equal(players.checkAdmin(ADMIN.toUpperCase(), '8.8.8.8'), false, 'case sensitive');
  for (let i = 0; i < 10; i++) assert.equal(players.checkAdmin('nope' + i, '9.9.9.9'), false);
  assert.throws(() => players.checkAdmin('nope', '9.9.9.9'), (e) => e.status === 429);
  assert.equal(players.checkAdmin(ADMIN, IP), true, 'verified key stays valid');
});

test('without ADMIN_KEY admin mode is disabled', async () => {
  const { players } = await setup({ SESSION_SECRET: 'test' });
  assert.equal(players.adminConfigured, false);
  assert.equal(players.checkAdmin('', IP), false);
  assert.throws(() => players.checkAdmin('anything', IP), (e) => e.status === 503);
});

test('sign up once, then register with nickname + PIN only', async () => {
  const { store, players } = await setup();
  const made = await players.create({ nickname: 'GermanCR', tag: '2y8lqo', clan: 'Metal', pin: '1234' });
  assert.equal(made.player.tag, '#2Y8LQ0');
  assert.match(made.recoveryCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await rejects(players.create({ nickname: 'germancr', tag: '#AAA', pin: '1111' }), 409);
  await rejects(players.create({ nickname: 'Other', tag: '#2Y8LQ0', pin: '1111' }), 409);
  await rejects(players.register({ tournamentId: 't1', nickname: 'GermanCR', pin: '0000' }, IP), 401);
  const r = await players.register({ tournamentId: 't1', nickname: 'germancr', pin: '1234' }, IP);
  assert.equal(r.registration.playerId, 'germancr');
  assert.equal(r.registration.name, 'GermanCR');
  await rejects(players.register({ tournamentId: 't1', nickname: 'GermanCR', pin: '1234' }, IP), 409);
  const { state } = await store.getState();
  assert.equal(state.registrations.length, 1);
});

test('wrong PINs lock the profile', async () => {
  const { players } = await setup();
  await players.create({ nickname: 'Lock', tag: '#LLL', pin: '1234' });
  for (let i = 0; i < 5; i++) await rejects(players.login({ nickname: 'Lock', pin: '9999' }, IP), 401);
  await rejects(players.login({ nickname: 'Lock', pin: '1234' }, IP), 429);
});

test('recovery code and admin reset both set a new PIN', async () => {
  const { players } = await setup();
  const made = await players.create({ nickname: 'Forget', tag: '#FFF', pin: '1234' });
  await rejects(players.recover({ nickname: 'Forget', code: 'AAAA-AAAA', newPin: '5555' }, IP), 401);
  const rec = await players.recover({ nickname: 'Forget', code: made.recoveryCode.toLowerCase().replace('-', ' '), newPin: '5555' }, IP);
  assert.ok(rec.recoveryCode && rec.recoveryCode !== made.recoveryCode);
  await players.login({ nickname: 'Forget', pin: '5555' }, IP);
  await rejects(players.recover({ nickname: 'Forget', code: made.recoveryCode, newPin: '6666' }, IP), 401);
  const reset = await players.adminReset({ nickname: 'forget' });
  assert.match(reset.pin, /^\d{4}$/);
  await players.login({ nickname: 'Forget', pin: reset.pin }, IP);
});

test('old registrations become profiles that claim a PIN on first use', async () => {
  const { store, players } = await setup();
  await store.applyBatch([
    { op: 'set', col: 'registrations', id: 'r1', data: { tournamentId: 'old', name: 'Shock Wave', tag: '#8ppyr2', createdAt: '1' } },
    { op: 'set', col: 'registrations', id: 'r2', data: { tournamentId: 'old2', name: 'ShockWave', tag: '#8PPYR2', createdAt: '2' } },
    { op: 'set', col: 'registrations', id: 'r3', data: { tournamentId: 'old', name: 'x', tag: 'bad tag!', createdAt: '3' } },
  ]);
  assert.equal(await players.migrate(), 2);
  assert.equal(await players.migrate(), 0, 'idempotent');
  const { state } = await store.getState();
  const sw = state.players.find((p) => p.id === 'shockwave');
  assert.equal(sw.tag, '#8PPYR2');
  assert.ok(state.registrations.filter((r) => r.playerId === 'shockwave').length === 2);
  assert.ok(state.players.find((p) => p.nickname === 'jugador'));
  await rejects(players.register({ tournamentId: 't1', nickname: 'ShockWave', pin: '1234' }, IP), 409);
  await players.claim({ nickname: 'ShockWave', pin: '4321' });
  await rejects(players.claim({ nickname: 'ShockWave', pin: '1111' }), 409);
  await players.register({ tournamentId: 't1', nickname: 'ShockWave', pin: '4321' }, IP);
});

test('game scores keep the best and collect beaten levels', async () => {
  const { players } = await setup();
  await players.create({ nickname: 'Gamer', tag: '#GGG', pin: '1234' });
  const { token } = await players.login({ nickname: 'Gamer', pin: '1234' }, IP);
  await rejects(players.gameScore({ token: 'bad.token', score: 10 }), 401);
  await rejects(players.gameScore({ token, score: 999999 }), 400);
  let r = await players.gameScore({ token, score: 500, levelWon: 1 });
  assert.equal(r.player.gameBest, 500);
  await rejects(players.gameScore({ token, score: 100, levelWon: 2 }), 429);
});

test('normTag fixes common typos', () => {
  assert.equal(normTag(' 2y8 lqo '), '#2Y8LQ0');
});
