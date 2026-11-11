'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../bracket');
const R = require('../ranking');

const NOW = '2026-01-01T00:00:00.000Z';

/* Plays one tournament where the lower registration index always wins. */
function playTournament(tid, playerIds, format = 'eliminacion') {
  const regs = playerIds.map((pid, i) => ({ id: tid + '-r' + i, tournamentId: tid, playerId: pid, name: pid, tag: '#T' + i }));
  const t = { id: tid, format, status: 'en curso' };
  const draw = B.createDraw(tid, format, regs.map((r) => ({ id: r.id, label: r.name })), NOW);
  Object.assign(t, draw.patch);
  let matches = draw.matches;
  const idx = (id) => regs.findIndex((r) => r.id === id);
  for (let guard = 0; guard < 200; guard++) {
    const m = matches.find((x) => x.playerAId && x.playerBId && !x.winnerId);
    if (!m) break;
    const side = idx(m.playerAId) < idx(m.playerBId) ? 'A' : 'B';
    const res = B.applyResult(t, matches, m.id, side, NOW);
    const byId = new Map(matches.map((x) => [x.id, x]));
    res.del.forEach((id) => byId.delete(id));
    res.set.forEach((x) => byId.set(x.id, x));
    matches = [...byId.values()];
    if (res.patch) Object.assign(t, res.patch);
  }
  return { t, regs, matches };
}

function stateOf(...tournaments) {
  return {
    players: [],
    tournaments: tournaments.map((x) => x.t),
    registrations: tournaments.flatMap((x) => x.regs),
    matches: tournaments.flatMap((x) => x.matches),
    teams: [],
  };
}

test('champion, runner-up and semifinal losers get placement points', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const s = stateOf(playTournament('t1', ids));
  const rows = R.compute(s);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by.a.titles, 1);
  assert.equal(rows[0].id, 'a', 'champion is first');
  ids.forEach((id) => assert.equal(by[id].tournaments, 1));
  // every point = participation + 5 per win + knockout + placement
  for (const r of rows) {
    assert.ok(r.points >= R.POINTS.participate);
    assert.equal((r.points - R.POINTS.participate) % 5, 0);
  }
  assert.equal(by.a.points, R.POINTS.participate + by.a.wins * 5 + R.POINTS.knockout + R.POINTS.champion);
  const finalists = rows.filter((r) => r.points >= R.POINTS.runnerUp);
  assert.ok(finalists.length >= 2);
  assert.deepEqual(by.a.badges.map((b) => b.key), ['participante', 'campeon']);
});

test('same profile adds up across tournaments and earns trophy tiers', () => {
  const ts = [];
  for (let i = 0; i < 10; i++) ts.push(playTournament('t' + i, ['zed', 'p' + i, 'q' + i]));
  const s = stateOf(...ts);
  const zed = R.compute(s).find((r) => r.id === 'zed');
  assert.equal(zed.tournaments, 10);
  assert.equal(zed.titles, 10);
  assert.equal(zed.badges[0].key, 'plata');
  const five = R.badges({ tournaments: 5, titles: 0, player: null });
  assert.equal(five[0].key, 'bronce');
  const fifteen = R.badges({ tournaments: 15, titles: 0, player: null });
  assert.equal(fifteen[0].key, 'oro');
});

test('tournaments without a draw do not count', () => {
  const s = stateOf(playTournament('t1', ['a', 'b']));
  s.tournaments.push({ id: 't2', status: 'abierto' });
  s.registrations.push({ id: 'x', tournamentId: 't2', playerId: 'a', name: 'a', tag: '#A' });
  assert.equal(R.compute(s).find((r) => r.id === 'a').tournaments, 1);
});

test('2v2 teams give points to both members', () => {
  const regs = ['a', 'b', 'c', 'd'].map((p, i) => ({ id: 'r' + i, tournamentId: 't', playerId: p, name: p, tag: '#X' + i }));
  const teams = [
    { id: 'team-1', tournamentId: 't', player1Id: 'r0', player2Id: 'r1' },
    { id: 'team-2', tournamentId: 't', player1Id: 'r2', player2Id: 'r3' },
  ];
  const t = { id: 't', format: 'eliminacion', mode: 'equipos' };
  const draw = B.createDraw('t', 'eliminacion', [{ id: 'team-1', label: 'A&B' }, { id: 'team-2', label: 'C&D' }], NOW);
  Object.assign(t, draw.patch);
  const final = draw.matches[0];
  const res = B.applyResult(t, draw.matches, final.id, final.playerAId === 'team-1' ? 'A' : 'B', NOW);
  const s = { players: [], tournaments: [t], registrations: regs, teams, matches: res.set };
  const by = Object.fromEntries(R.compute(s).map((r) => [r.id, r]));
  assert.equal(by.a.titles, 1); assert.equal(by.b.titles, 1);
  assert.equal(by.c.titles, 0); assert.equal(by.a.points, by.b.points);
});

test('kraneo badge needs the 3 game levels', () => {
  const s = { players: [{ id: 'k', nickname: 'K', gameBest: 900, gameLevels: [1, 2, 3] }, { id: 'j', nickname: 'J', gameBest: 1200, gameLevels: [1, 2] }], tournaments: [], registrations: [], matches: [], teams: [] };
  const by = Object.fromEntries(R.compute(s).map((r) => [r.id, r]));
  assert.deepEqual(by.k.badges.map((b) => b.key), ['kraneo']);
  assert.deepEqual(by.j.badges, []);
  assert.deepEqual(R.gameTable(s).map((p) => p.id), ['j', 'k']);
});

test('old registrations without a profile are grouped by tag', () => {
  const x = playTournament('t1', ['a', 'b']);
  x.regs.forEach((r) => delete r.playerId);
  const y = playTournament('t2', ['a', 'b']);
  y.regs.forEach((r, i) => { delete r.playerId; r.tag = x.regs[i].tag; });
  const rows = R.compute(stateOf(x, y));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].tournaments, 2);
});
