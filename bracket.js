/*
 * Metal Assault — tournament engine (pure functions, no DOM).
 *
 * Formats
 * - "eliminacion": group stage + knockout. Entrants are split into G groups
 *   (G = largest power of two with at least 3 players per group), everybody
 *   plays everybody in their group, and the top 2 of each group go to a
 *   knockout bracket with crossed seeding (1A vs 2B, 1B vs 2A, ...), so two
 *   players from the same group can only meet again in the final.
 *   With 8 players: 2 groups of 4 (3 matches each) -> semifinals -> final.
 * - "liga": a single group (everybody vs everybody) + final between the top 2.
 * - With only 2 entrants there is no group stage: they play the final.
 *
 * Matches are plain objects stored in the "matches" collection:
 *   group match:    kind 'grupo', group (index), round (jornada), slot
 *   knockout match: kind 'bracket', round (1..K), slot; bye matches have bye:true
 * Legacy data (kind 'liga' / 'final', or old brackets without kind) is read too.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MABracket = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function groupName(i) { return 'Grupo ' + (GROUP_LETTERS[i] || String(i + 1)); }

  function koMatchId(tid, round, slot) { return 'm-' + tid + '-r' + round + 's' + slot; }
  function groupMatchId(tid, g, round, slot) { return 'g-' + tid + '-g' + g + '-r' + round + 's' + slot; }

  function isGroupMatch(m) { return m.kind === 'grupo' || m.kind === 'liga'; }
  function isKoMatch(m) { return !isGroupMatch(m); }
  function values(obj) { return Object.keys(obj).map(function (k) { return obj[k]; }); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function log2(n) { return Math.round(Math.log(n) / Math.LN2); }

  /* Legacy documents are mapped onto the current model. */
  function normalize(m) {
    var n = clone(m);
    if (n.kind === 'final') { n.round = 1; n.slot = 0; }
    if (isGroupMatch(n) && typeof n.group !== 'number') n.group = 0;
    return n;
  }

  function groupCount(n, format) {
    if (n < 3) return 0;
    if (format === 'liga') return 1;
    var g = 1;
    while (g * 2 * 3 <= n) g *= 2;
    return g;
  }

  /* Circle method; returns one array of pairs per jornada. */
  function roundRobin(members) {
    var list = members.slice();
    if (list.length % 2) list.push(null);
    var n = list.length, rounds = [];
    var fixed = list[0], rest = list.slice(1);
    for (var r = 0; r < n - 1; r++) {
      var order = [fixed].concat(rest), pairs = [];
      for (var i = 0; i < n / 2; i++) {
        var a = order[i], b = order[n - 1 - i];
        if (a && b) pairs.push([a, b]);
      }
      rounds.push(pairs);
      rest.unshift(rest.pop());
    }
    return rounds;
  }

  function emptyKo(tid, round, slot, now) {
    return {
      id: koMatchId(tid, round, slot), tournamentId: tid, kind: 'bracket', round: round, slot: slot,
      playerAId: '', playerAName: '', playerBId: '', playerBName: '', winnerId: '', winnerName: '', createdAt: now
    };
  }

  /* Puts the winner of knockout match m into its slot of the next round. */
  function placeInNext(d, tid, K, m, now) {
    if (m.round >= K) return;
    var nid = koMatchId(tid, m.round + 1, Math.floor(m.slot / 2));
    var nx = d[nid] || (d[nid] = emptyKo(tid, m.round + 1, Math.floor(m.slot / 2), now));
    if (m.slot % 2 === 0) { nx.playerAId = m.winnerId; nx.playerAName = m.winnerName; }
    else { nx.playerBId = m.winnerId; nx.playerBName = m.winnerName; }
  }

  /* Clears the result of knockout match m and everything that depended on it.
     Returns how many later decided matches had to be cleared. */
  function clearKo(d, tid, K, m) {
    var cleared = 0;
    if (m.winnerId && m.round < K) {
      var nx = d[koMatchId(tid, m.round + 1, Math.floor(m.slot / 2))];
      if (nx) {
        if (nx.winnerId) cleared += 1 + clearKo(d, tid, K, nx);
        if (m.slot % 2 === 0) { nx.playerAId = ''; nx.playerAName = ''; }
        else { nx.playerBId = ''; nx.playerBName = ''; }
      }
    }
    m.winnerId = ''; m.winnerName = '';
    return cleared;
  }

  /* Adds a knockout bracket to draft d from round-1 pairs [[a,b],...]
     (b may be null = bye; byes advance automatically). Returns K (rounds). */
  function addKnockout(d, tid, pairs, now) {
    var K = log2(pairs.length * 2);
    pairs.forEach(function (p, i) {
      var a = p[0] || null, b = p[1] || null;
      var m = emptyKo(tid, 1, i, now);
      if (a) { m.playerAId = a.id; m.playerAName = a.label; }
      if (b) { m.playerBId = b.id; m.playerBName = b.label; }
      if ((a && !b) || (b && !a)) {
        var w = a || b;
        m.winnerId = w.id; m.winnerName = w.label; m.bye = true;
      }
      d[m.id] = m;
    });
    pairs.forEach(function (p, i) {
      var m = d[koMatchId(tid, 1, i)];
      if (m.winnerId) placeInNext(d, tid, K, m, now);
    });
    return K;
  }

  /* Direct knockout: byes are spread so every bye faces a real player and no
     match is ever empty (entrant i plays entrant i + size/2). */
  function directPairs(entrants) {
    var size = 2;
    while (size < entrants.length) size *= 2;
    var pairs = [];
    for (var i = 0; i < size / 2; i++) pairs.push([entrants[i] || null, entrants[i + size / 2] || null]);
    return pairs;
  }

  /* ------------------------------------------------------------------ */
  /* Draw: builds groups + group matches (or a direct knockout).        */
  function createDraw(tid, format, entrants, now) {
    var G = groupCount(entrants.length, format);
    var d = {};
    if (!G) {
      var K = addKnockout(d, tid, directPairs(entrants), now);
      return { patch: { groups: null, knockoutRounds: K }, matches: values(d) };
    }
    var groups = [];
    for (var g = 0; g < G; g++) groups.push({ name: groupName(g), members: [] });
    entrants.forEach(function (e, i) {
      groups[i % G].members.push({ id: e.id, label: e.label, seed: i });
    });
    var matches = [];
    groups.forEach(function (gr, gi) {
      roundRobin(gr.members).forEach(function (pairs, ri) {
        pairs.forEach(function (p, si) {
          matches.push({
            id: groupMatchId(tid, gi, ri + 1, si), tournamentId: tid, kind: 'grupo', group: gi,
            round: ri + 1, slot: si,
            playerAId: p[0].id, playerAName: p[0].label, playerBId: p[1].id, playerBName: p[1].label,
            winnerId: '', winnerName: '', createdAt: now
          });
        });
      });
    });
    return { patch: { groups: groups, knockoutRounds: log2(G * 2) }, matches: matches };
  }

  /* Groups and number of knockout rounds for a tournament (handles legacy). */
  function structure(t, ms) {
    var groupMs = ms.filter(isGroupMatch);
    var groups = [];
    if (t.groups && t.groups.length) {
      groups = t.groups;
    } else if (groupMs.length) {
      var byGroup = {};
      groupMs.slice().sort(function (a, b) { return a.round - b.round || a.slot - b.slot; }).forEach(function (m) {
        var gi = m.group || 0;
        var gr = byGroup[gi] || (byGroup[gi] = { name: groupName(gi), members: [], seen: {} });
        [[m.playerAId, m.playerAName], [m.playerBId, m.playerBName]].forEach(function (p) {
          if (p[0] && !gr.seen[p[0]]) { gr.seen[p[0]] = true; gr.members.push({ id: p[0], label: p[1], seed: gr.members.length }); }
        });
      });
      Object.keys(byGroup).sort(function (a, b) { return a - b; }).forEach(function (k) {
        groups.push({ name: byGroup[k].name, members: byGroup[k].members });
      });
    }
    var K = t.knockoutRounds;
    if (!K) {
      if (groups.length) K = log2(groups.length * 2);
      else {
        K = t.totalRounds || 0;
        ms.filter(isKoMatch).forEach(function (m) { if (m.round > K) K = m.round; });
        K = K || 1;
      }
    }
    return { groups: groups, K: K };
  }

  /* Group table: wins, then head-to-head among tied players, then draw order. */
  function groupStandings(group, groupMatches) {
    var st = {};
    group.members.forEach(function (mb, i) {
      st[mb.id] = { id: mb.id, label: mb.label, seed: typeof mb.seed === 'number' ? mb.seed : i, played: 0, wins: 0, losses: 0, tie: '' };
    });
    groupMatches.forEach(function (m) {
      var a = st[m.playerAId], b = st[m.playerBId];
      if (!a || !b || !m.winnerId) return;
      a.played++; b.played++;
      if (m.winnerId === m.playerAId) { a.wins++; b.losses++; } else { b.wins++; a.losses++; }
    });
    var rows = values(st).sort(function (x, y) { return y.wins - x.wins || x.seed - y.seed; });
    var out = [], i = 0;
    while (i < rows.length) {
      var j = i;
      while (j < rows.length && rows[j].wins === rows[i].wins) j++;
      var block = rows.slice(i, j);
      if (block.length > 1) {
        var inBlock = {}, h2h = {};
        block.forEach(function (r) { inBlock[r.id] = true; h2h[r.id] = 0; });
        groupMatches.forEach(function (m) {
          if (m.winnerId && inBlock[m.playerAId] && inBlock[m.playerBId]) h2h[m.winnerId]++;
        });
        block.sort(function (x, y) { return h2h[y.id] - h2h[x.id] || x.seed - y.seed; });
        block.forEach(function (r, k) {
          var prev = block[k - 1], next = block[k + 1];
          var bySeed = (prev && h2h[prev.id] === h2h[r.id]) || (next && h2h[next.id] === h2h[r.id]);
          r.tie = bySeed ? 'sorteo' : 'directo';
        });
      }
      out = out.concat(block);
      i = j;
    }
    return out;
  }

  function matchesOfGroup(ms, gi) {
    return ms.filter(function (m) { return isGroupMatch(m) && (m.group || 0) === gi; });
  }

  /* Round-1 knockout pairs from the final group tables (crossed seeding). */
  function knockoutPairs(groups, ms) {
    var tables = groups.map(function (g, gi) { return groupStandings(g, matchesOfGroup(ms, gi)); });
    function q(gi, pos) { var r = tables[gi][pos]; return r ? { id: r.id, label: r.label } : null; }
    if (groups.length === 1) return [[q(0, 0), q(0, 1)]];
    var pairs = [], half = groups.length / 2, i;
    for (i = 0; i < half; i++) pairs.push([q(2 * i, 0), q(2 * i + 1, 1)]);
    for (i = 0; i < half; i++) pairs.push([q(2 * i + 1, 0), q(2 * i, 1)]);
    return pairs;
  }

  /* Labels for the knockout before the group stage ends ("1° Grupo A" ...). */
  function placeholderPairs(groups) {
    function q(gi, pos) { return (pos + 1) + '° ' + groups[gi].name; }
    if (groups.length === 1) return [[q(0, 0), q(0, 1)]];
    var pairs = [], half = groups.length / 2, i;
    for (i = 0; i < half; i++) pairs.push([q(2 * i, 0), q(2 * i + 1, 1)]);
    for (i = 0; i < half; i++) pairs.push([q(2 * i + 1, 0), q(2 * i, 1)]);
    return pairs;
  }

  /* Keeps the knockout consistent with the group stage inside draft d.
     Returns how many decided knockout results were discarded. */
  function syncKnockoutDraft(t, d, info, now) {
    if (!info.groups.length) return 0;
    var all = values(d);
    var gms = all.filter(isGroupMatch);
    var ko = all.filter(isKoMatch);
    var complete = gms.length > 0 && gms.every(function (m) { return !!m.winnerId; });
    var pairs = complete ? knockoutPairs(info.groups, all) : null;
    if (pairs && ko.length) {
      var r1 = ko.filter(function (m) { return m.round === 1; });
      var same = r1.length === pairs.length && pairs.every(function (p, i) {
        var x = r1.filter(function (m) { return m.slot === i; })[0];
        return x && x.playerAId === (p[0] ? p[0].id : '') && x.playerBId === (p[1] ? p[1].id : '');
      });
      if (same) return 0;
    }
    var lost = ko.filter(function (m) { return m.winnerId && m.playerAId && m.playerBId; }).length;
    ko.forEach(function (m) { delete d[m.id]; });
    if (pairs) addKnockout(d, t.id, pairs, now);
    return lost;
  }

  function championFrom(ms, K) {
    var f = ms.filter(function (m) { return isKoMatch(m) && m.round === K && m.slot === 0; })[0];
    return f && f.winnerId ? { id: f.winnerId, name: f.winnerName } : null;
  }

  function champion(t, allMatches) {
    var ms = allMatches.filter(function (m) { return m.tournamentId === t.id; }).map(normalize);
    if (!ms.length) return null;
    return championFrom(ms, structure(t, ms).K);
  }

  function draftFor(t, allMatches) {
    var orig = {}, d = {};
    allMatches.forEach(function (m) {
      if (m.tournamentId !== t.id) return;
      var n = normalize(m);
      orig[n.id] = JSON.stringify(n);
      d[n.id] = n;
    });
    return { orig: orig, d: d };
  }

  function finish(t, draft, info, extra) {
    var set = [], del = [];
    Object.keys(draft.d).forEach(function (id) {
      if (JSON.stringify(draft.d[id]) !== draft.orig[id]) set.push(draft.d[id]);
    });
    Object.keys(draft.orig).forEach(function (id) { if (!draft.d[id]) del.push(id); });
    var champ = championFrom(values(draft.d), info.K);
    var patch = null;
    if (champ && t.status !== 'finalizado') patch = { status: 'finalizado' };
    else if (!champ && t.status === 'finalizado') patch = { status: 'en curso' };
    return {
      set: set, del: del, patch: patch,
      cleared: extra.cleared || 0, koReset: extra.koReset || 0,
      changed: set.length > 0 || del.length > 0 || !!patch
    };
  }

  /* Records (side 'A' / 'B'), changes, or removes (side null) a result.
     Returns null when nothing would change. The result lists the match
     documents to write/delete, an optional tournament patch, and how many
     dependent results are discarded (cleared + koReset) so the UI can ask
     for confirmation first. */
  function applyResult(t, allMatches, matchId, side, now) {
    var draft = draftFor(t, allMatches);
    var d = draft.d, m = d[matchId];
    if (!m) return null;
    var info = structure(t, values(d));
    var winnerId = '', winnerName = '';
    if (side) {
      if (!m.playerAId || !m.playerBId) return null;
      winnerId = side === 'A' ? m.playerAId : m.playerBId;
      winnerName = side === 'A' ? m.playerAName : m.playerBName;
    } else if (m.bye) {
      return null;
    }
    if (winnerId === (m.winnerId || '')) return null;

    var extra = {};
    if (isGroupMatch(m)) {
      m.winnerId = winnerId; m.winnerName = winnerName;
      extra.koReset = syncKnockoutDraft(t, d, info, now);
    } else {
      if (m.winnerId) extra.cleared = clearKo(d, t.id, info.K, m);
      if (winnerId) {
        m.winnerId = winnerId; m.winnerName = winnerName;
        placeInNext(d, t.id, info.K, m, now);
      }
    }
    return finish(t, draft, info, extra);
  }

  /* Repairs a tournament whose groups are complete but whose knockout was
     never generated (e.g. legacy data). Returns null if nothing to do. */
  function syncKnockout(t, allMatches, now) {
    var draft = draftFor(t, allMatches);
    var info = structure(t, values(draft.d));
    if (!info.groups.length) return null;
    var koReset = syncKnockoutDraft(t, draft.d, info, now);
    var res = finish(t, draft, info, { koReset: koReset });
    return res.changed ? res : null;
  }

  function roundName(round, K) {
    var left = K - round;
    return ['Final', 'Semifinal', 'Cuartos de final', 'Octavos de final', 'Dieciseisavos'][left] || ('Ronda ' + round);
  }

  /* Human summary of the format for a number of entrants. */
  function describeFormat(n, format) {
    if (n < 2) return 'Se necesitan al menos 2 participantes.';
    var G = groupCount(n, format);
    if (!G) return 'Final directa entre los 2 participantes.';
    if (G === 1) return 'Un grupo de ' + n + ' (todos contra todos, ' + (n - 1) + ' partidas cada uno) y final entre los 2 mejores.';
    var min = Math.floor(n / G), max = Math.ceil(n / G);
    var size = min === max ? String(min) : (min + '-' + max);
    return G + ' grupos de ' + size + ' (todos contra todos, mínimo ' + (min - 1) + ' partidas cada uno). ' +
      'Clasifican 2 por grupo a ' + roundName(1, log2(G * 2)).toLowerCase() + ' con cruces 1° vs 2° de otro grupo.';
  }

  return {
    createDraw: createDraw,
    applyResult: applyResult,
    syncKnockout: syncKnockout,
    structure: structure,
    normalize: normalize,
    groupStandings: groupStandings,
    matchesOfGroup: matchesOfGroup,
    placeholderPairs: placeholderPairs,
    champion: champion,
    roundName: roundName,
    groupCount: groupCount,
    describeFormat: describeFormat,
    isGroupMatch: isGroupMatch,
    isKoMatch: isKoMatch,
    koMatchId: koMatchId,
    directKnockout: function (tid, entrants, now) {
      var d = {};
      var K = addKnockout(d, tid, directPairs(entrants), now);
      return { knockoutRounds: K, matches: values(d) };
    }
  };
});
