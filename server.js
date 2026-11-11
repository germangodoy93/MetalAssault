'use strict';
const express = require('express');
const path = require('path');
const { createStore, validateOps, IMAGE_ID_RE } = require('./store');
const { createPlayers, publicPlayer } = require('./players');

const PORT = process.env.PORT || 3000;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const PUBLIC_FILES = { '/logo.jpg': 'logo.jpg', '/bracket.js': 'bracket.js', '/ranking.js': 'ranking.js', '/kraneo3d.js': 'kraneo3d.js', '/kraneo-game.js': 'kraneo-game.js' };
for (const b of ['participante', 'bronce', 'plata', 'oro', 'campeon', 'kraneo']) PUBLIC_FILES[`/badges/${b}.png`] = `badges/${b}.png`;

const store = createStore(process.env);
const players = createPlayers(store, process.env);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway sits behind one proxy: req.ip is the visitor's address

/* Tournament management (batch writes, images) needs the admin key. */
function requireAdmin(req, res, next) {
  try {
    if (players.checkAdmin(req.get('X-Admin-Key'), req.ip)) return next();
    res.status(401).json({ error: 'Necesitas la clave de administrador.' });
  } catch (e) { next(e); }
}
const smallJson = express.json({ limit: '10kb' });

/* ---------------- live updates (Server-Sent Events) ---------------- */
const clients = new Set();
function broadcast(version) {
  const msg = `data: ${JSON.stringify({ version })}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n'); // keeps proxies from closing idle streams
}, 25000).unref();

app.get('/api/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

/* ---------------- data API ---------------- */
app.get('/api/health', (req, res) => res.json({ ok: true, storage: store.kind }));

app.get('/api/state', async (req, res, next) => {
  try {
    const { version, state } = await store.getState();
    state.players = state.players.map((p) => publicPlayer(p.id, p)); // never send PIN hashes
    res.set('Cache-Control', 'no-store').json(Object.assign({ version }, state));
  } catch (e) { next(e); }
});

/* ---------------- admin + players ---------------- */
app.post('/api/admin/login', smallJson, (req, res, next) => {
  try {
    if (players.checkAdmin(req.body && req.body.key, req.ip)) return res.json({ ok: true });
    res.status(401).json({ error: 'Clave de administrador incorrecta.' });
  } catch (e) { next(e); }
});

/* Runs a player action; broadcasts when it changed the data. */
function playerRoute(path, action, opts = {}) {
  const chain = [smallJson];
  if (opts.admin) chain.push(requireAdmin);
  app.post(path, ...chain, async (req, res, next) => {
    try {
      const out = await action(req.body || {}, req.ip);
      if (out.version) broadcast(out.version);
      res.json(Object.assign({ ok: true }, out));
    } catch (e) { next(e); }
  });
}
playerRoute('/api/players', (b) => players.create(b));
playerRoute('/api/players/claim', (b) => players.claim(b));
playerRoute('/api/players/login', (b, ip) => players.login(b, ip));
playerRoute('/api/players/update', (b, ip) => players.update(b, ip));
playerRoute('/api/players/recover', (b, ip) => players.recover(b, ip));
playerRoute('/api/admin/reset-pin', (b) => players.adminReset(b), { admin: true });
playerRoute('/api/register', (b, ip) => players.register(b, ip));
playerRoute('/api/game/score', (b) => players.gameScore(b));

app.post('/api/batch', requireAdmin, express.json({ limit: '12mb' }), async (req, res, next) => {
  try {
    const ops = validateOps(req.body && req.body.ops);
    const version = await store.applyBatch(ops);
    broadcast(version);
    res.json({ ok: true, version });
  } catch (e) { next(e); }
});

app.post('/api/images', requireAdmin, express.raw({ type: () => true, limit: '6mb' }), async (req, res, next) => {
  try {
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(mime)) return res.status(415).json({ error: 'Formato de imagen no permitido' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Imagen vacía' });
    const id = await store.putImage(req.body, mime);
    res.json({ id, url: `/api/images/${id}` });
  } catch (e) { next(e); }
});

app.get('/api/images/:id', async (req, res, next) => {
  try {
    if (!IMAGE_ID_RE.test(req.params.id)) return res.sendStatus(404);
    const img = await store.getImage(req.params.id);
    if (!img) return res.sendStatus(404);
    res.set({ 'Content-Type': img.mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.send(img.data);
  } catch (e) { next(e); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

/* ---------------- static app (only the public files) ---------------- */
for (const [route, file] of Object.entries(PUBLIC_FILES)) {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, file), { maxAge: '1h' }));
}
app.get('*', (req, res) => {
  res.set('Cache-Control', 'no-cache').sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error del servidor' : err.message });
});

/* ---------------- start ---------------- */
store.init().then(() => players.migrate()).then((made) => {
  if (made) console.log(`Perfiles creados a partir de inscripciones anteriores: ${made}`);
  const server = app.listen(PORT, () => {
    console.log(`Metal Assault running on port ${PORT} (storage: ${store.kind})`);
    if (!players.adminConfigured) {
      console.warn('ADVERTENCIA: falta la variable ADMIN_KEY. Nadie podrá entrar como administrador hasta definirla (en Railway: Variables).');
    }
    if (store.kind === 'file' && process.env.RAILWAY_ENVIRONMENT) {
      console.warn('ADVERTENCIA: falta DATABASE_URL. Los datos se guardan en el disco temporal del contenedor y se perderán en el próximo despliegue. Agrega Postgres en Railway.');
    }
  });
  const shutdown = () => {
    for (const res of clients) res.end();
    server.close(() => store.close().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}).catch((e) => {
  console.error('No se pudo inicializar el almacenamiento:', e);
  process.exit(1);
});
