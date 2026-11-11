'use strict';
/*
 * Player profiles, the admin key and everything that needs a secret.
 *
 * - A player signs up once (nickname + Clash Royale tag + optional clan +
 *   4-digit PIN). Later tournaments only need nickname + PIN.
 * - Forgotten PIN: the player uses the recovery code shown at sign-up, or
 *   the admin resets it (and hands over a new PIN and recovery code).
 * - PINs and recovery codes are stored as salted scrypt hashes and never
 *   leave the server (see publicPlayer).
 * - Wrong PINs lock the profile for a while, so 4 digits can't be guessed.
 */
const crypto = require('crypto');

// The admin key lives only in the ADMIN_KEY environment variable (Railway →
// Variables), never in the code. Without it, admin mode is disabled.

const NICK_RE = /^[A-Za-z0-9_.-]{3,20}$/;
const TAG_RE = /^#[0-9A-Z]{3,12}$/;
const PIN_RE = /^\d{4}$/;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const GAME_MAX_SCORE = 20000;

/* ---------------- secrets ---------------- */
function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  return 'scrypt$' + salt + '$' + crypto.scryptSync(String(secret), salt, 32).toString('hex');
}
function verifySecret(secret, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const want = Buffer.from(parts[2], 'hex');
  const got = crypto.scryptSync(String(secret), parts[1], want.length);
  return want.length > 0 && crypto.timingSafeEqual(want, got);
}
function newRecoveryCode() {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function newPin() { return String(crypto.randomInt(0, 10000)).padStart(4, '0'); }

/* ---------------- input rules ---------------- */
function httpError(status, msg) { const e = new Error(msg); e.status = status; return e; }
function nickId(nick) { return String(nick || '').trim().toLowerCase(); }
function cleanNick(nick) {
  const n = String(nick || '').trim();
  if (!NICK_RE.test(n)) throw httpError(400, 'El nickname debe tener de 3 a 20 caracteres: letras, números, punto, guion o guion bajo (sin espacios).');
  return n;
}
function normTag(tag) {
  let t = String(tag || '').toUpperCase().replace(/\s+/g, '').replace(/O/g, '0');
  if (t && t[0] !== '#') t = '#' + t;
  return t;
}
function cleanTag(tag) {
  const t = normTag(tag);
  if (!TAG_RE.test(t)) throw httpError(400, 'El tag de Clash Royale no es válido (ejemplo: #2Y8LQ0).');
  return t;
}
function cleanClan(clan) { return String(clan || '').trim().slice(0, 40); }
function cleanPin(pin) {
  const p = String(pin == null ? '' : pin).trim();
  if (!PIN_RE.test(p)) throw httpError(400, 'El PIN debe tener exactamente 4 dígitos.');
  return p;
}

/* What everybody may see of a profile. */
function publicPlayer(id, p) {
  return {
    id,
    nickname: p.nickname,
    tag: p.tag || '',
    clan: p.clan || '',
    createdAt: p.createdAt || '',
    hasPin: !!p.pinHash,
    gameBest: p.gameBest || 0,
    gameLevels: Array.isArray(p.gameLevels) ? p.gameLevels : [],
  };
}

/* ---------------- failed-attempt limiter ---------------- */
class Limiter {
  constructor(max, windowMs) { this.max = max; this.windowMs = windowMs; this.map = new Map(); }
  entry(key, now) {
    let e = this.map.get(key);
    if (!e || now - e.start > this.windowMs) { e = { start: now, count: 0 }; this.map.set(key, e); }
    return e;
  }
  blocked(key, now = Date.now()) { return this.entry(key, now).count >= this.max; }
  minutesLeft(key, now = Date.now()) { const e = this.entry(key, now); return Math.max(1, Math.ceil((e.start + this.windowMs - now) / 60000)); }
  fail(key, now = Date.now()) { this.entry(key, now).count++; }
  clear(key) { this.map.delete(key); }
  prune(now = Date.now()) { for (const [k, e] of this.map) if (now - e.start > this.windowMs) this.map.delete(k); }
}

/* ---------------- service ---------------- */
function createPlayers(store, env = {}) {
  const adminHash = env.ADMIN_KEY ? hashSecret(env.ADMIN_KEY) : null;
  const adminOk = new Set();                       // sha256 of keys already verified (skips scrypt)
  const adminFails = new Limiter(10, 15 * 60000);  // per IP
  const pinFails = new Limiter(5, 15 * 60000);     // per profile
  const ipFails = new Limiter(30, 15 * 60000);     // per IP, across profiles
  const lastScore = new Map();
  const tokenSecret = env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  setInterval(() => { adminFails.prune(); pinFails.prune(); ipFails.prune(); }, 10 * 60000).unref();

  // One write at a time: check-then-write sequences (cupos, nickname libre) stay consistent.
  let queue = Promise.resolve();
  function locked(fn) { const p = queue.then(fn); queue = p.catch(() => {}); return p; }

  async function all() {
    const { state } = await store.getState();
    return state;
  }
  function findPlayer(state, nick) {
    const id = nickId(nick);
    const p = state.players.find((x) => x.id === id);
    if (!p) throw httpError(404, 'No existe un jugador con ese nickname.');
    return p;
  }
  function tagOwner(state, tag, exceptId) {
    return state.players.find((x) => x.tag === tag && x.id !== exceptId);
  }
  function stripId(p) { const c = Object.assign({}, p); delete c.id; return c; }

  /* ---- admin ---- */
  function checkAdmin(key, ip) {
    const k = String(key || '');
    if (!k) return false;
    if (!adminHash) throw httpError(503, 'El modo administrador no está configurado en el servidor (falta ADMIN_KEY).');
    const digest = crypto.createHash('sha256').update(k).digest('hex');
    if (adminOk.has(digest)) return true;
    if (adminFails.blocked(ip)) throw httpError(429, `Demasiados intentos. Prueba de nuevo en ${adminFails.minutesLeft(ip)} min.`);
    if (verifySecret(k, adminHash)) { adminOk.add(digest); adminFails.clear(ip); return true; }
    adminFails.fail(ip);
    return false;
  }

  /* ---- PIN checks ---- */
  function checkPin(p, pin, ip) {
    if (pinFails.blocked(p.id) || ipFails.blocked(ip)) {
      throw httpError(429, `Demasiados intentos fallidos. Prueba de nuevo en ${pinFails.blocked(p.id) ? pinFails.minutesLeft(p.id) : ipFails.minutesLeft(ip)} min o usa «¿Olvidaste tu PIN?».`);
    }
    if (!p.pinHash) throw httpError(409, 'Este perfil todavía no tiene PIN. Créalo primero.');
    if (!verifySecret(pin, p.pinHash)) {
      pinFails.fail(p.id); ipFails.fail(ip);
      throw httpError(401, 'PIN incorrecto.');
    }
    pinFails.clear(p.id);
  }

  /* ---- session tokens (used by the game to save scores) ---- */
  function sign(payload) { return crypto.createHmac('sha256', tokenSecret).update(payload).digest('base64url'); }
  function makeToken(id) {
    const payload = Buffer.from(JSON.stringify({ id, exp: Date.now() + 30 * 86400000 })).toString('base64url');
    return payload + '.' + sign(payload);
  }
  function readToken(token) {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const want = Buffer.from(sign(payload)), got = Buffer.from(sig);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
    try {
      const j = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return j.exp > Date.now() ? j.id : null;
    } catch { return null; }
  }

  return {
    checkAdmin,
    adminConfigured: !!adminHash,

    /* New profile. Returns { player, recoveryCode }. */
    create(body) {
      return locked(async () => {
        const nickname = cleanNick(body.nickname);
        const tag = cleanTag(body.tag);
        const clan = cleanClan(body.clan);
        const pin = cleanPin(body.pin);
        const id = nickId(nickname);
        const state = await all();
        if (state.players.some((x) => x.id === id)) throw httpError(409, 'Ese nickname ya está en uso. Si es tuyo, escribe tu PIN.');
        const owner = tagOwner(state, tag, id);
        if (owner) throw httpError(409, `Ese tag ya pertenece al jugador ${owner.nickname}.`);
        const recoveryCode = newRecoveryCode();
        const doc = { nickname, tag, clan, pinHash: hashSecret(pin), recoveryHash: hashSecret(normCode(recoveryCode)), createdAt: new Date().toISOString() };
        const version = await store.applyBatch([{ op: 'set', col: 'players', id, data: doc }]);
        return { version, player: publicPlayer(id, doc), recoveryCode };
      });
    },

    /* Profiles brought over from old registrations have no PIN: the first use sets it. */
    claim(body) {
      return locked(async () => {
        const pin = cleanPin(body.pin);
        const p = findPlayer(await all(), body.nickname);
        if (p.pinHash) throw httpError(409, 'Este perfil ya tiene PIN.');
        const recoveryCode = newRecoveryCode();
        const version = await store.applyBatch([{ op: 'merge', col: 'players', id: p.id, data: { pinHash: hashSecret(pin), recoveryHash: hashSecret(normCode(recoveryCode)) } }]);
        return { version, player: publicPlayer(p.id, p), recoveryCode };
      });
    },

    login(body, ip) {
      return locked(async () => {
        const p = findPlayer(await all(), body.nickname);
        checkPin(p, cleanPin(body.pin), ip);
        return { player: publicPlayer(p.id, p), token: makeToken(p.id) };
      });
    },

    update(body, ip) {
      return locked(async () => {
        const state = await all();
        const p = findPlayer(state, body.nickname);
        checkPin(p, cleanPin(body.pin), ip);
        const tag = cleanTag(body.tag);
        const owner = tagOwner(state, tag, p.id);
        if (owner) throw httpError(409, `Ese tag ya pertenece al jugador ${owner.nickname}.`);
        const data = { tag, clan: cleanClan(body.clan) };
        const version = await store.applyBatch([{ op: 'merge', col: 'players', id: p.id, data }]);
        return { version, player: publicPlayer(p.id, Object.assign({}, p, data)) };
      });
    },

    /* Forgotten PIN, self-service: recovery code -> new PIN (+ a fresh code). */
    recover(body, ip) {
      return locked(async () => {
        const pin = cleanPin(body.newPin);
        const p = findPlayer(await all(), body.nickname);
        if (pinFails.blocked(p.id) || ipFails.blocked(ip)) throw httpError(429, `Demasiados intentos fallidos. Prueba de nuevo en ${pinFails.minutesLeft(p.id)} min o pide ayuda al administrador.`);
        if (!p.recoveryHash || !verifySecret(normCode(body.code), p.recoveryHash)) {
          pinFails.fail(p.id); ipFails.fail(ip);
          throw httpError(401, 'Código de recuperación incorrecto.');
        }
        pinFails.clear(p.id);
        const recoveryCode = newRecoveryCode();
        const version = await store.applyBatch([{ op: 'merge', col: 'players', id: p.id, data: { pinHash: hashSecret(pin), recoveryHash: hashSecret(normCode(recoveryCode)) } }]);
        return { version, recoveryCode };
      });
    },

    /* Admin: new random PIN and recovery code, to hand over to the player. */
    adminReset(body) {
      return locked(async () => {
        const p = findPlayer(await all(), body.nickname);
        const pin = newPin();
        const recoveryCode = newRecoveryCode();
        const version = await store.applyBatch([{ op: 'merge', col: 'players', id: p.id, data: { pinHash: hashSecret(pin), recoveryHash: hashSecret(normCode(recoveryCode)) } }]);
        pinFails.clear(p.id);
        return { version, nickname: p.nickname, pin, recoveryCode };
      });
    },

    /* Signs a player up for an open tournament. */
    register(body, ip) {
      return locked(async () => {
        const state = await all();
        const p = findPlayer(state, body.nickname);
        checkPin(p, cleanPin(body.pin), ip);
        const t = state.tournaments.find((x) => x.id === body.tournamentId);
        if (!t) throw httpError(404, 'Ese torneo no existe.');
        if (t.status !== 'abierto') throw httpError(409, 'Este torneo no acepta inscripciones.');
        const regs = state.registrations.filter((r) => r.tournamentId === t.id);
        if (regs.some((r) => r.playerId === p.id || (p.tag && String(r.tag).toUpperCase() === p.tag))) throw httpError(409, 'Ya estás inscrito en este torneo.');
        if (regs.length >= (Number(t.maxPlayers) || 0)) throw httpError(409, 'Cupos llenos para este torneo.');
        const id = crypto.randomUUID();
        const doc = { tournamentId: t.id, playerId: p.id, name: p.nickname, tag: p.tag, clan: p.clan || '', createdAt: new Date().toISOString() };
        const version = await store.applyBatch([{ op: 'set', col: 'registrations', id, data: doc }]);
        return { version, registration: Object.assign({ id }, doc) };
      });
    },

    /* Game result. levelWon = 1|2|3 when a level was beaten in that run. */
    gameScore(body) {
      return locked(async () => {
        const id = readToken(body.token);
        if (!id) throw httpError(401, 'Tu sesión del juego expiró. Vuelve a entrar con tu nickname y PIN.');
        const score = Math.floor(Number(body.score));
        if (!Number.isFinite(score) || score < 0 || score > GAME_MAX_SCORE) throw httpError(400, 'Puntaje no válido.');
        const levelWon = [1, 2, 3].includes(body.levelWon) ? body.levelWon : null;
        const now = Date.now();
        if (now - (lastScore.get(id) || 0) < 5000) throw httpError(429, 'Espera unos segundos antes de guardar otro puntaje.');
        lastScore.set(id, now);
        const p = (await all()).players.find((x) => x.id === id);
        if (!p) throw httpError(404, 'Ese jugador ya no existe.');
        const levels = new Set(Array.isArray(p.gameLevels) ? p.gameLevels : []);
        if (levelWon) levels.add(levelWon);
        const data = { gameBest: Math.max(p.gameBest || 0, score), gameLevels: [...levels].sort() };
        const newLevel = !!levelWon && !(p.gameLevels || []).includes(levelWon);
        if (score <= (p.gameBest || 0) && !newLevel) return { version: null, player: publicPlayer(id, p) };
        if (data.gameLevels.length === 3 && !p.gameBeatenAt) data.gameBeatenAt = new Date().toISOString();
        const version = await store.applyBatch([{ op: 'merge', col: 'players', id, data }]);
        return { version, player: publicPlayer(id, Object.assign({}, p, data)) };
      });
    },

    /* Turns the old per-tournament registrations into profiles (no PIN yet). Idempotent. */
    migrate() {
      return locked(async () => {
        const state = await all();
        const pending = state.registrations.filter((r) => !r.playerId).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
        if (!pending.length) return 0;
        const byTag = new Map(), taken = new Set();
        state.players.forEach((p) => { taken.add(p.id); if (p.tag) byTag.set(p.tag, p.id); });
        const ops = [], made = new Map();
        for (const r of pending) {
          const tag = normTag(r.tag);
          const key = TAG_RE.test(tag) ? tag : 'name:' + String(r.name || '').trim().toLowerCase();
          let pid = byTag.get(key);
          if (!pid) {
            let base = String(r.name || '').replace(/\s+/g, '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 17);
            if (base.length < 3) base = 'jugador';
            let nick = base, n = 2;
            while (taken.has(nick.toLowerCase())) nick = base + (n++);
            pid = nick.toLowerCase();
            taken.add(pid); byTag.set(key, pid);
            made.set(pid, { nickname: nick, tag: TAG_RE.test(tag) ? tag : '', clan: cleanClan(r.clan), createdAt: r.createdAt || new Date().toISOString(), migrated: true });
          }
          ops.push({ op: 'merge', col: 'registrations', id: r.id, data: { playerId: pid } });
        }
        for (const [pid, doc] of made) ops.unshift({ op: 'set', col: 'players', id: pid, data: doc });
        for (let i = 0; i < ops.length; i += 500) await store.applyBatch(ops.slice(i, i + 500));
        return made.size;
      });
    },

    publicPlayer,
  };
}

module.exports = { createPlayers, publicPlayer, hashSecret, verifySecret, normTag, cleanTag, cleanNick, Limiter };
