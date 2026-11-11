/*
 * Metal Assault — player ranking, points and badges (pure functions, no DOM).
 *
 * Points per tournament (only tournaments with a draw count):
 *   +10 for taking part, +5 per match won (byes don't count),
 *   +10 for reaching the knockout (when there was a group stage),
 *   +50 champion, +35 runner-up, +20 each semifinal loser (3rd place).
 * In 2v2 events both team members get the team's points.
 *
 * Badges: participante (1+ tournaments), bronce (5+), plata (10+), oro (15+),
 * campeón (won at least one tournament), kraneo (beat the 3 game levels).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./bracket'));
  else root.MARanking = factory(root.MABracket);
})(typeof self !== 'undefined' ? self : this, function (B) {
  'use strict';

  var POINTS = { participate: 10, win: 5, knockout: 10, champion: 50, runnerUp: 35, third: 20 };
  var TIERS = [
    { min: 15, key: 'oro', icon: '🥇', label: 'Trofeo de oro', hint: '15 torneos o más' },
    { min: 10, key: 'plata', icon: '🥈', label: 'Trofeo de plata', hint: '10 torneos o más' },
    { min: 5, key: 'bronce', icon: '🥉', label: 'Trofeo de bronce', hint: '5 torneos o más' },
    { min: 1, key: 'participante', icon: '🎖️', label: 'Participante de torneos', hint: 'Jugó al menos un torneo' }
  ];

  /* Key that identifies a person across tournaments: the profile id, or the
     tag for old registrations that never got one. */
  function regKey(r) {
    if (r.playerId) return r.playerId;
    return 'tag:' + String(r.tag || r.name || r.id).toUpperCase();
  }

  function compute(state) {
    var players = state.players || [];
    var regs = state.registrations || [];
    var regById = {}, teamById = {};
    regs.forEach(function (r) { regById[r.id] = r; });
    (state.teams || []).forEach(function (t) { teamById[t.id] = t; });

    var rows = {};
    function row(key, reg) {
      if (!rows[key]) {
        var p = players.filter(function (x) { return x.id === key; })[0];
        rows[key] = {
          id: key, nickname: p ? p.nickname : (reg ? reg.name : key), tag: p ? p.tag : (reg ? reg.tag : ''),
          tournaments: 0, wins: 0, losses: 0, titles: 0, points: 0, player: p || null
        };
      }
      return rows[key];
    }
    /* entrant id (registration or team) -> profile rows */
    function people(entrantId) {
      var team = teamById[entrantId];
      var ids = team ? [team.player1Id, team.player2Id] : [entrantId];
      return ids.map(function (id) { return regById[id]; }).filter(Boolean).map(function (r) { return row(regKey(r), r); });
    }
    function give(entrantId, field, amount) {
      people(entrantId).forEach(function (r) { r[field] += amount; });
    }

    (state.tournaments || []).forEach(function (t) {
      var ms = (state.matches || []).filter(function (m) { return m.tournamentId === t.id; }).map(B.normalize);
      if (!ms.length) return;
      var st = B.structure(t, ms);
      var entrants = {}, inKo = {};
      ms.forEach(function (m) {
        [m.playerAId, m.playerBId].forEach(function (id) {
          if (!id) return;
          entrants[id] = true;
          if (B.isKoMatch(m)) inKo[id] = true;
        });
        if (m.winnerId && m.playerAId && m.playerBId && !m.bye) {
          var loser = m.winnerId === m.playerAId ? m.playerBId : m.playerAId;
          give(m.winnerId, 'wins', 1); give(m.winnerId, 'points', POINTS.win);
          give(loser, 'losses', 1);
        }
      });
      Object.keys(entrants).forEach(function (id) {
        give(id, 'tournaments', 1); give(id, 'points', POINTS.participate);
        if (st.groups.length && inKo[id]) give(id, 'points', POINTS.knockout);
      });
      var final = ms.filter(function (m) { return B.isKoMatch(m) && m.round === st.K && m.slot === 0; })[0];
      if (final && final.winnerId && final.playerAId && final.playerBId) {
        give(final.winnerId, 'titles', 1); give(final.winnerId, 'points', POINTS.champion);
        give(final.winnerId === final.playerAId ? final.playerBId : final.playerAId, 'points', POINTS.runnerUp);
        ms.forEach(function (m) {
          if (B.isKoMatch(m) && st.K >= 2 && m.round === st.K - 1 && m.winnerId && m.playerAId && m.playerBId && !m.bye) {
            give(m.winnerId === m.playerAId ? m.playerBId : m.playerAId, 'points', POINTS.third);
          }
        });
      }
    });

    // profiles that never played still show up (badges from the game, etc.)
    players.forEach(function (p) { row(p.id); });
    var list = Object.keys(rows).map(function (k) {
      var r = rows[k];
      r.badges = badges(r);
      return r;
    });
    list.sort(function (a, b) {
      return b.points - a.points || b.titles - a.titles || b.wins - a.wins || a.losses - b.losses ||
        String(a.nickname).localeCompare(String(b.nickname));
    });
    return list;
  }

  function badges(r) {
    var out = [];
    for (var i = 0; i < TIERS.length; i++) {
      if (r.tournaments >= TIERS[i].min) { out.push({ key: TIERS[i].key, icon: TIERS[i].icon, img: img(TIERS[i].key), label: TIERS[i].label + ' · ' + r.tournaments + ' torneo' + (r.tournaments === 1 ? '' : 's') }); break; }
    }
    if (r.titles > 0) out.push({ key: 'campeon', icon: '🏆', img: img('campeon'), label: 'Campeón' + (r.titles > 1 ? ' ×' + r.titles : ''), count: r.titles });
    if (r.player && r.player.gameLevels && [1, 2, 3].every(function (l) { return r.player.gameLevels.indexOf(l) >= 0; })) {
      out.push({ key: 'kraneo', icon: '💀', img: img('kraneo'), label: 'Kraneo · superó los 3 niveles del juego' });
    }
    return out;
  }
  function img(key) { return 'badges/' + key + '.png'; }

  /* Game table: profiles with a saved score, best first. */
  function gameTable(state) {
    return (state.players || []).filter(function (p) { return p.gameBest > 0 || (p.gameLevels && p.gameLevels.length); })
      .slice().sort(function (a, b) { return (b.gameBest || 0) - (a.gameBest || 0) || String(a.nickname).localeCompare(String(b.nickname)); });
  }

  return { compute: compute, gameTable: gameTable, badges: badges, badgeImg: img, regKey: regKey, POINTS: POINTS, TIERS: TIERS };
});
