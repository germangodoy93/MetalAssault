'use strict';
/*
 * Shared storage for Metal Assault.
 *
 * Data is a set of JSON documents grouped in collections (tournaments,
 * registrations, teams, matches, posts, social). Every write goes through
 * applyBatch(), which applies a list of operations atomically and bumps a
 * global version number so connected clients know they must refresh.
 *
 * - PgStore:   used when DATABASE_URL is set (Railway Postgres).
 * - FileStore: local fallback that keeps everything in ./data (development).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COLLECTIONS = new Set(['tournaments', 'registrations', 'teams', 'matches', 'posts', 'social']);
const ID_RE = /^[A-Za-z0-9_.:-]{1,200}$/;
const IMAGE_ID_RE = /^[0-9a-f-]{36}$/;
const MAX_OPS = 1000;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/* Validates and normalises a batch coming from the client. Throws on bad input. */
function validateOps(ops) {
  if (!Array.isArray(ops) || ops.length === 0) throw badRequest('ops debe ser una lista no vacía');
  if (ops.length > MAX_OPS) throw badRequest('Demasiadas operaciones en un solo lote');
  return ops.map((o, i) => {
    if (!isPlainObject(o)) throw badRequest(`op ${i}: formato inválido`);
    const { op, col, id } = o;
    if (!['set', 'merge', 'delete'].includes(op)) throw badRequest(`op ${i}: operación desconocida`);
    if (!COLLECTIONS.has(col)) throw badRequest(`op ${i}: colección desconocida`);
    if (typeof id !== 'string' || !ID_RE.test(id)) throw badRequest(`op ${i}: id inválido`);
    if (op === 'delete') return { op, col, id };
    if (!isPlainObject(o.data)) throw badRequest(`op ${i}: data debe ser un objeto`);
    const data = Object.assign({}, o.data);
    delete data.id; // the id lives in the key, never inside the document
    return { op, col, id, data };
  });
}

function badRequest(msg) {
  const e = new Error(msg);
  e.status = 400;
  return e;
}

function emptyState() {
  const s = { social: {} };
  for (const c of COLLECTIONS) if (c !== 'social') s[c] = [];
  return s;
}

/* ------------------------------------------------------------------ */
class PgStore {
  constructor(pool) {
    this.pool = pool;
    this.kind = 'postgres';
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS docs (
        collection text NOT NULL,
        id text NOT NULL,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (collection, id)
      );
      CREATE TABLE IF NOT EXISTS images (
        id text PRIMARY KEY,
        mime text NOT NULL,
        data bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS meta (
        key text PRIMARY KEY,
        value bigint NOT NULL
      );
      INSERT INTO meta (key, value) VALUES ('version', 0) ON CONFLICT (key) DO NOTHING;
    `);
  }

  async getState() {
    const client = await this.pool.connect();
    try {
      // One consistent snapshot for the version and the documents.
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const v = await client.query(`SELECT value FROM meta WHERE key = 'version'`);
      const rows = await client.query('SELECT collection, id, data FROM docs');
      await client.query('COMMIT');
      const state = emptyState();
      for (const r of rows.rows) {
        if (r.collection === 'social') {
          if (r.id === 'links') state.social = r.data;
        } else if (state[r.collection]) {
          state[r.collection].push(Object.assign({}, r.data, { id: r.id }));
        }
      }
      return { version: Number(v.rows[0] ? v.rows[0].value : 0), state };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async applyBatch(ops) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const o of ops) {
        if (o.op === 'delete') {
          await client.query('DELETE FROM docs WHERE collection = $1 AND id = $2', [o.col, o.id]);
        } else if (o.op === 'set') {
          await client.query(
            `INSERT INTO docs (collection, id, data) VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
            [o.col, o.id, JSON.stringify(o.data)]
          );
        } else {
          // merge = shallow update of the top-level fields (upsert if missing)
          await client.query(
            `INSERT INTO docs (collection, id, data) VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (collection, id) DO UPDATE SET data = docs.data || EXCLUDED.data, updated_at = now()`,
            [o.col, o.id, JSON.stringify(o.data)]
          );
        }
      }
      const v = await client.query(`UPDATE meta SET value = value + 1 WHERE key = 'version' RETURNING value`);
      await client.query('COMMIT');
      return Number(v.rows[0].value);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async putImage(buffer, mime) {
    const id = crypto.randomUUID();
    await this.pool.query('INSERT INTO images (id, mime, data) VALUES ($1, $2, $3)', [id, mime, buffer]);
    return id;
  }

  async getImage(id) {
    const r = await this.pool.query('SELECT mime, data FROM images WHERE id = $1', [id]);
    return r.rows[0] ? { mime: r.rows[0].mime, data: r.rows[0].data } : null;
  }

  async close() {
    await this.pool.end();
  }
}

/* ------------------------------------------------------------------ */
class FileStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'store.json');
    this.imgDir = path.join(dir, 'images');
    this.kind = 'file';
    this.db = { version: 0, docs: {}, images: {} };
    this.queue = Promise.resolve();
  }

  async init() {
    fs.mkdirSync(this.imgDir, { recursive: true });
    if (fs.existsSync(this.file)) {
      this.db = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.db.docs = this.db.docs || {};
      this.db.images = this.db.images || {};
    }
  }

  persist() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.db));
    fs.renameSync(tmp, this.file);
  }

  async getState() {
    const state = emptyState();
    for (const [col, docs] of Object.entries(this.db.docs)) {
      for (const [id, data] of Object.entries(docs)) {
        if (col === 'social') {
          if (id === 'links') state.social = data;
        } else if (state[col]) {
          state[col].push(Object.assign({}, data, { id }));
        }
      }
    }
    return { version: this.db.version, state: JSON.parse(JSON.stringify(state)) };
  }

  applyBatch(ops) {
    // Serialise writes; apply to a copy so a failure leaves the store intact.
    const run = async () => {
      const docs = JSON.parse(JSON.stringify(this.db.docs));
      for (const o of ops) {
        docs[o.col] = docs[o.col] || {};
        if (o.op === 'delete') delete docs[o.col][o.id];
        else if (o.op === 'set') docs[o.col][o.id] = o.data;
        else docs[o.col][o.id] = Object.assign({}, docs[o.col][o.id] || {}, o.data);
      }
      this.db.docs = docs;
      this.db.version += 1;
      this.persist();
      return this.db.version;
    };
    const p = this.queue.then(run);
    this.queue = p.catch(() => {});
    return p;
  }

  async putImage(buffer, mime) {
    const id = crypto.randomUUID();
    fs.writeFileSync(path.join(this.imgDir, id), buffer);
    this.db.images[id] = mime;
    this.persist();
    return id;
  }

  async getImage(id) {
    const mime = this.db.images[id];
    if (!mime) return null;
    return { mime, data: fs.readFileSync(path.join(this.imgDir, id)) };
  }

  async close() {}
}

/* ------------------------------------------------------------------ */
function createStore(env) {
  if (env.DATABASE_URL) {
    const { Pool } = require('pg');
    const ssl = env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
    return new PgStore(new Pool({ connectionString: env.DATABASE_URL, ssl, max: 10 }));
  }
  return new FileStore(env.DATA_DIR || path.join(__dirname, 'data'));
}

module.exports = { createStore, validateOps, PgStore, FileStore, IMAGE_ID_RE };
