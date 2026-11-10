'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../bracket');

const NOW = '2026-01-01T00:00:00.000Z';
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, label: 'P' + i }));

/* Small in-memory tournament to drive the engine like the UI does. */
function setup(n, format = 'eliminacion') {
  const t = { id: 't1', format, status: 'en curso' };
  const draw = B.createDraw(t.id, format, players(n), NOW);
  Object.assign(t, draw.patch);
  return { t, matches: draw.matches };
}
function apply(ctx, res) {
  assert.ok(res, 'expected a change');
  const byId = new Map(ctx.matches.map((m) => [m.id, m]));
  res.del.forEach((id) => byId.delete(id));
  res.set.forEach((m) => byId.set(m.id, m));
  ctx.matches = [...byId.values()];
  if (res.patch) Object.assign(ctx.t, res.patch);
  return res;
}
function pick(ctx, id, side) { return apply(ctx, B.applyResult(ctx.t, ctx.matches, id, side, NOW)); }
const groupMs = (ctx) => ctx.matches.filter(B.isGroupMatch);
const koMs = (ctx) => ctx.matches.filter(B.isKoMatch);
/* Lower player index always wins -> deterministic standings. */
function playGroupsByIndex(ctx) {
  for (const m of groupMs(ctx)) {
    const a = Number(m.playerAId.slice(1)), b = Number(m.playerBId.slice(1));
    pick(ctx, m.id, a < b ? 'A' : 'B');
  }
}

test('8 players -> 2 groups of 4, everyone plays 3 group matches, no knockout yet', () => {
  const ctx = setup(8);
  assert.equal(ctx.t.groups.length, 2);
  assert.deepEqual(ctx.t.groups.map((g) => g.members.length), [4, 4]);
  assert.equal(ctx.t.knockoutRounds, 2);
  assert.equal(groupMs(ctx).length, 12);
  assert.equal(koMs(ctx).length, 0);
  const played = {};
  for (const m of groupMs(ctx)) {
    played[m.playerAId] = (played[m.playerAId] || 0) + 1;
    played[m.playerBId] = (played[m.playerBId] || 0) + 1;
  }
  assert.deepEqual(Object.values(played), Array(8).fill(3));
});

test('group sizes for other counts', () => {
  const sizes = (n) => setup(n).t.groups?.map((g) => g.members.length) ?? null;
  assert.equal(sizes(2), null); // direct final
  assert.deepEqual(sizes(3), [3]);
  assert.deepEqual(sizes(5), [5]);
  assert.deepEqual(sizes(6), [3, 3]);
  assert.deepEqual(sizes(7), [4, 3]);
  assert.deepEqual(sizes(12), [3, 3, 3, 3]);
  assert.deepEqual(sizes(16), [4, 4, 4, 4]);
  assert.deepEqual(setup(6, 'liga').t.groups.map((g) => g.members.length), [6]);
});

test('finishing the groups creates crossed semifinals (1A-2B, 1B-2A), then final and champion', () => {
  const ctx = setup(8);
  playGroupsByIndex(ctx);
  // groups: A = p0,p2,p4,p6 ; B = p1,p3,p5,p7 (i % 2)
  const semis = koMs(ctx).filter((m) => m.round === 1).sort((a, b) => a.slot - b.slot);
  assert.deepEqual(semis.map((m) => [m.playerAId, m.playerBId]), [['p0', 'p3'], ['p1', 'p2']]);
  pick(ctx, semis[0].id, 'A');
  pick(ctx, semis[1].id, 'B');
  const final = koMs(ctx).find((m) => m.round === 2);
  assert.deepEqual([final.playerAId, final.playerBId], ['p0', 'p2']);
  pick(ctx, final.id, 'B');
  assert.equal(ctx.t.status, 'finalizado');
  assert.deepEqual(B.champion(ctx.t, ctx.matches), { id: 'p2', name: 'P2' });
});

test('undoing a semifinal clears the final and reopens the tournament', () => {
  const ctx = setup(8);
  playGroupsByIndex(ctx);
  const semi0 = B.koMatchId('t1', 1, 0), semi1 = B.koMatchId('t1', 1, 1), fin = B.koMatchId('t1', 2, 0);
  pick(ctx, semi0, 'A');
  pick(ctx, semi1, 'A');
  pick(ctx, fin, 'A');
  assert.equal(ctx.t.status, 'finalizado');

  const res = pick(ctx, semi0, null); // remove wrong winner
  assert.equal(res.cleared, 1, 'the decided final depends on it');
  const final = ctx.matches.find((m) => m.id === fin);
  assert.equal(final.winnerId, '');
  assert.equal(final.playerAId, '', 'removed player leaves the final');
  assert.equal(final.playerBId, 'p1', 'the other semifinal winner stays');
  assert.equal(ctx.t.status, 'en curso');

  pick(ctx, semi0, 'B'); // choose the correct one
  assert.equal(ctx.matches.find((m) => m.id === fin).playerAId, 'p3');
});

test('changing a winner directly moves the right player forward', () => {
  const ctx = setup(8);
  playGroupsByIndex(ctx);
  const semi0 = B.koMatchId('t1', 1, 0), fin = B.koMatchId('t1', 2, 0);
  pick(ctx, semi0, 'A');
  const res = pick(ctx, semi0, 'B');
  assert.equal(res.cleared, 0);
  assert.equal(ctx.matches.find((m) => m.id === fin).playerAId, 'p3');
});

test('a group change that keeps the same qualifiers keeps knockout results', () => {
  const ctx = setup(8);
  playGroupsByIndex(ctx);
  pick(ctx, B.koMatchId('t1', 1, 0), 'A');
  // p4 vs p6 (3rd vs 4th in group A) does not change who qualifies
  const m = groupMs(ctx).find((x) => [x.playerAId, x.playerBId].sort().join() === 'p4,p6');
  const res = pick(ctx, m.id, m.playerAId === 'p6' ? 'A' : 'B');
  assert.equal(res.koReset, 0);
  assert.equal(ctx.matches.find((x) => x.id === B.koMatchId('t1', 1, 0)).winnerId, 'p0');
});

test('a group change that alters qualifiers rebuilds the knockout and reports lost results', () => {
  const ctx = setup(8);
  playGroupsByIndex(ctx);
  pick(ctx, B.koMatchId('t1', 1, 0), 'A');
  const m = groupMs(ctx).find((x) => [x.playerAId, x.playerBId].sort().join() === 'p0,p2');
  const res = B.applyResult(ctx.t, ctx.matches, m.id, null, NOW); // undo -> group incomplete
  assert.equal(res.koReset, 1);
  apply(ctx, res);
  assert.equal(koMs(ctx).length, 0);
});

test('tie-break: head-to-head first, then draw order', () => {
  const group = { members: [{ id: 'a', label: 'A', seed: 0 }, { id: 'b', label: 'B', seed: 1 }, { id: 'c', label: 'C', seed: 2 }] };
  const mk = (x, y, w) => ({ kind: 'grupo', group: 0, playerAId: x, playerBId: y, winnerId: w });
  // 3-way tie, 1 win each -> draw order a, b, c
  let rows = B.groupStandings(group, [mk('a', 'b', 'b'), mk('b', 'c', 'c'), mk('c', 'a', 'a')]);
  assert.deepEqual(rows.map((r) => r.id + ':' + r.tie), ['a:sorteo', 'b:sorteo', 'c:sorteo']);
  // 4 players: c and b tie on 2 wins, c beat b -> c above b
  const g4 = { members: [...group.members, { id: 'd', label: 'D', seed: 3 }] };
  rows = B.groupStandings(g4, [
    mk('a', 'b', 'b'), mk('a', 'c', 'c'), mk('a', 'd', 'a'),
    mk('b', 'c', 'c'), mk('b', 'd', 'b'), mk('c', 'd', 'd'),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['c', 'b', 'a', 'd']);
  assert.equal(rows[0].tie, 'directo');
});

test('2 entrants -> direct final', () => {
  const ctx = setup(2);
  assert.equal(ctx.matches.length, 1);
  assert.deepEqual([ctx.matches[0].playerAId, ctx.matches[0].playerBId], ['p0', 'p1']);
  pick(ctx, ctx.matches[0].id, 'B');
  assert.equal(ctx.t.status, 'finalizado');
});

test('direct knockout with byes never leaves an empty match and byes advance', () => {
  const ko = B.directKnockout('k', players(5), NOW);
  assert.equal(ko.knockoutRounds, 3);
  const r1 = ko.matches.filter((m) => m.round === 1);
  assert.equal(r1.length, 4);
  assert.ok(r1.every((m) => m.playerAId), 'every first-round match has a real player');
  assert.equal(r1.filter((m) => m.bye).length, 3);
  const r2 = ko.matches.filter((m) => m.round === 2).sort((a, b) => a.slot - b.slot);
  assert.deepEqual(r2.map((m) => [m.playerAId, m.playerBId]), [['', 'p1'], ['p2', 'p3']]);
  // bye results cannot be undone
  const t = { id: 'k', status: 'en curso', knockoutRounds: 3 };
  assert.equal(B.applyResult(t, ko.matches, r1.find((m) => m.bye).id, null, NOW), null);
});

test('legacy elimination bracket: winner can be undone and rechosen', () => {
  const t = { id: 'old', format: 'eliminacion', status: 'en curso', totalRounds: 2 };
  const m = (r, s, a, b) => ({ id: B.koMatchId('old', r, s), tournamentId: 'old', round: r, slot: s, playerAId: a, playerAName: a, playerBId: b, playerBName: b, winnerId: '', winnerName: '' });
  const ctx = { t, matches: [m(1, 0, 'w', 'x'), m(1, 1, 'y', 'z')] };
  pick(ctx, B.koMatchId('old', 1, 0), 'A');
  assert.equal(ctx.matches.find((x) => x.id === B.koMatchId('old', 2, 0)).playerAId, 'w');
  pick(ctx, B.koMatchId('old', 1, 0), null);
  assert.equal(ctx.matches.find((x) => x.id === B.koMatchId('old', 2, 0)).playerAId, '');
});

test('legacy liga (kind liga + final) is read as one group with a final', () => {
  const t = { id: 'lg', format: 'liga', status: 'en curso', ligaJornadas: 3 };
  const lm = (r, s, a, b, w) => ({ id: `lg-lg-r${r}s${s}`, tournamentId: 'lg', kind: 'liga', round: r, slot: s, playerAId: a, playerAName: a, playerBId: b, playerBName: b, winnerId: w, winnerName: w });
  const matches = [lm(1, 0, 'a', 'b', 'a'), lm(2, 0, 'a', 'c', 'a'), lm(3, 0, 'b', 'c', 'b')];
  const fix = B.syncKnockout(t, matches, NOW);
  assert.ok(fix);
  assert.deepEqual([fix.set[0].playerAId, fix.set[0].playerBId], ['a', 'b']);
});

test('describeFormat for 8 players', () => {
  assert.match(B.describeFormat(8, 'eliminacion'), /2 grupos de 4/);
});
