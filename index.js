require('dotenv').config();

const path = require('path');
const express = require('express');
const http = require('node:http');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const { Server } = require('socket.io');
const { Movements, goals } = require('mineflayer-pathfinder');
const { createProxyMiddleware } = require('http-proxy-middleware');

const { requireAuth, requireAdmin } = require('./lib/auth');
const db = require('./lib/db');
const userStore = require('./lib/userStore');
const servers = require('./lib/servers');
const botManager = require('./lib/botManager');
const { isRateLimited, recordAttempt, clearAttempts } = require('./lib/rateLimiter');

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

// Refuse to boot with insecure defaults rather than silently running unprotected.
if (!ADMIN_PASSWORD) {
  console.error('FATAL: ADMIN_PASSWORD is not set. Create a .env file (see .env.example) or set it in your host\'s environment variables.');
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error('FATAL: MONGODB_URI is not set. Add your MongoDB connection string as a variable (see .env.example).');
  process.exit(1);
}
if (!SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

app.set('trust proxy', 1); // required for secure cookies behind Railway/most PaaS reverse proxies
app.use(express.json());
app.get('/health', (req, res) => res.json({ ok: true }));

const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');

const sessionMiddleware = session({
  name: 'aurora.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    clientPromise: db.connect(),
    dbName: process.env.MONGODB_DB || 'aurora',
    collectionName: 'sessions',
    ttl: 60 * 60 * 24 * 7 // seconds, matches cookie maxAge below
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
});
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip || 'unknown';
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });

  let authedUser = null;
  try {
    authedUser = await userStore.verifyUser(username, password);
  } catch (err) {
    console.error('Login lookup failed:', err.message);
    return res.status(500).json({ error: 'Login failed, please try again' });
  }

  if (!authedUser) {
    recordAttempt(ip);
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  clearAttempts(ip);
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Login failed, please try again' });
    req.session.user = authedUser;
    req.session.save(saveErr => {
      if (saveErr) return res.status(500).json({ error: 'Login failed, please try again' });
      res.json({ user: authedUser });
    });
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: req.session.user });
});

// ---------------------------------------------------------------------------
// Admin: user management (no public self-registration exists anywhere)
// ---------------------------------------------------------------------------
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  res.json({ users: await userStore.listUsers() });
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ error: 'Username and a password of at least 6 characters are required' });
  }
  try {
    const user = await userStore.createUser(username.trim(), password);
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:username', requireAuth, requireAdmin, async (req, res) => {
  const { username } = req.params;
  for (const id of await servers.deleteForOwner(username)) botManager.remove(id);
  const removed = await userStore.deleteUser(username);
  res.json({ removed });
});

// ---------------------------------------------------------------------------
// Registration, servers (bots), nodes and access codes
// ---------------------------------------------------------------------------
const signups = new Map(); // ip -> timestamps (max 5 sign-ups per IP per hour)
app.get('/api/public-config', async (req, res) => res.json({ registrationOpen: await servers.registrationOpen() }));

app.post('/api/auth/register', async (req, res) => {
  const ip = req.ip || 'unknown', now = Date.now();
  const recent = (signups.get(ip) || []).filter(t => now - t < 3600e3);
  if (recent.length >= 5) return res.status(429).json({ error: 'Too many sign-ups from this network. Try again later.' });
  if (!(await servers.registrationOpen())) return res.status(403).json({ error: 'Registration is currently closed.' });
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 6) return res.status(400).json({ error: 'Choose a username and a password of at least 6 characters' });
  try {
    const user = await userStore.createUser(String(username).trim(), password);
    signups.set(ip, [...recent, now]);
    const sessionUser = { username: user.username, role: user.role };
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Account created, please sign in' });
      req.session.user = sessionUser;
      req.session.save(() => res.json({ user: sessionUser }));
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const view = (s, nodeName) => ({ id: s._id, name: s.name, plan: s.plan, label: servers.PLANS[s.plan].label, viewer: servers.PLANS[s.plan].viewer, until: s.until, suspended: s.suspended, active: servers.isActive(s), node: nodeName });
const mine = async req => (await servers.listForOwner(req.session.user.username));

app.get('/api/servers', requireAuth, async (req, res) => {
  const nodeNames = Object.fromEntries((await servers.listNodes()).map(n => [n.id, n.name]));
  res.json({ servers: (await mine(req)).map(s => view(s, nodeNames[s.nodeId])), current: req.session.serverId || null });
});
app.get('/api/servers/current', requireAuth, async (req, res) => {
  const s = req.session.serverId && await servers.getServer(req.session.serverId);
  if (!s || s.ownerLower !== req.session.user.username.toLowerCase()) return res.status(404).json({ error: 'No bot selected' });
  res.json(view(s));
});
app.post('/api/servers/:id/select', requireAuth, async (req, res) => {
  const s = await servers.getServer(req.params.id);
  if (!s || s.ownerLower !== req.session.user.username.toLowerCase()) return res.status(404).json({ error: 'Bot not found' });
  req.session.serverId = s._id;
  req.session.save(() => res.json({ ok: true }));
});
app.post('/api/redeem', requireAuth, async (req, res) => {
  const ip = req.ip || 'unknown';
  if (isRateLimited('redeem:' + ip)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  try {
    const s = await servers.redeemCode(req.session.user.username, req.body && req.body.code);
    res.json({ server: view(s) });
  } catch (err) {
    recordAttempt('redeem:' + ip);
    res.status(400).json({ error: err.message });
  }
});

const fail = (res, err, code = 400) => res.status(code).json({ error: err.message });
app.get('/api/admin/nodes', requireAuth, requireAdmin, async (req, res) => res.json({ nodes: await servers.listNodes() }));
app.get('/api/admin/servers', requireAuth, requireAdmin, async (req, res) => {
  const nodeNames = Object.fromEntries((await servers.listNodes()).map(n => [n.id, n.name]));
  res.json({ servers: (await servers.listAll()).map(s => ({ ...view(s, nodeNames[s.nodeId]), owner: s.owner })) });
});
app.post('/api/admin/servers', requireAuth, requireAdmin, async (req, res) => {
  try { res.json({ server: await servers.createServer(req.body || {}) }); } catch (err) { fail(res, err); }
});
app.post('/api/admin/servers/:id/suspend', requireAuth, requireAdmin, async (req, res) => {
  try {
    const suspended = await servers.toggleSuspend(req.params.id);
    if (suspended) botManager.get(req.params.id)?.stop();
    res.json({ suspended });
  } catch (err) { fail(res, err, 404); }
});
app.post('/api/admin/servers/:id/renew', requireAuth, requireAdmin, async (req, res) => {
  try { await servers.renew(req.params.id, req.body && req.body.days); res.json({ ok: true }); } catch (err) { fail(res, err); }
});
app.delete('/api/admin/servers/:id', requireAuth, requireAdmin, async (req, res) => {
  botManager.remove(req.params.id);
  res.json({ removed: await servers.deleteServer(req.params.id) });
});
app.get('/api/admin/codes', requireAuth, requireAdmin, async (req, res) => res.json({ codes: await servers.listCodes() }));
app.post('/api/admin/codes', requireAuth, requireAdmin, async (req, res) => {
  try { res.json({ codes: await servers.createCodes(req.body || {}) }); } catch (err) { fail(res, err); }
});
app.post('/api/admin/codes/:code/toggle', requireAuth, requireAdmin, async (req, res) => {
  try { res.json({ disabled: await servers.toggleCode(req.params.code) }); } catch (err) { fail(res, err, 404); }
});
app.get('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => res.json({ registrationOpen: await servers.registrationOpen() }));
app.post('/api/admin/settings', requireAuth, requireAdmin, async (req, res) => {
  await servers.setRegistrationOpen(req.body && req.body.registrationOpen); res.json({ registrationOpen: await servers.registrationOpen() });
});

// Resolve the bot for the server this session has selected (and check it belongs to them).
async function botFor(req, res) {
  const s = req.session.serverId && await servers.getServer(req.session.serverId);
  if (!s || s.ownerLower !== req.session.user.username.toLowerCase()) { res.status(409).json({ error: 'No bot selected', code: 'NO_SERVER' }); return null; }
  return botManager.getOrCreate(s._id, io);
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
app.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/servers', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'servers.html')));

app.get('/', async (req, res) => {
  // The same URL shows different pages depending on login, so never cache it.
  res.set({ 'Cache-Control': 'no-store, must-revalidate', Vary: 'Cookie' });
  const user = req.session?.user;
  if (!user) return res.sendFile(path.join(__dirname, 'public', 'landing.html'));
  const list = await servers.listForOwner(user.username);
  if (req.session.serverId && list.some(s => s._id === req.session.serverId)) return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  if (list.length === 1) { req.session.serverId = list[0]._id; return req.session.save(() => res.sendFile(path.join(__dirname, 'public', 'index.html'))); }
  res.sendFile(path.join(__dirname, 'public', 'servers.html')); // none or several: pick / redeem
});

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Bot control API — every route below is scoped to req.session.user.username,
// so each logged-in user only ever sees and controls their own bot instance.
// ---------------------------------------------------------------------------
app.get('/api/state', requireAuth, async (req, res) => {
  const bot = await botFor(req, res); if (!bot) return;
  res.json({ state: bot.state, logs: bot.logs, supportedVersions: bot.state.supportedVersions });
});

app.post('/api/chat', requireAuth, async (req, res) => {
  const bot = await botFor(req, res); if (!bot) return;
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'Message is required' });
  res.json({ sent: bot.sendChat(message) });
});

app.post('/api/config', requireAuth, async (req, res) => {
  const bot = await botFor(req, res); if (!bot) return;
  const result = bot.updateConfig(req.body || {});
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ state: bot.state });
});

app.post('/api/route/:action', requireAuth, async (req, res) => {
  const bot = await botFor(req, res); if (!bot) return;
  const { action } = req.params;

  if (action === 'start') {
    bot.routeRecording = true;
    bot.addLog('Route recording started', 'system');
  } else if (action === 'stop') {
    bot.routeRecording = false;
    bot.persist();
    bot.addLog(`Route recording stopped with ${bot.route.length} checkpoints`, 'system');
  } else if (action === 'checkpoint') {
    if (!bot.routeRecording) return res.status(400).json({ error: 'Start route recording first' });
    if (!bot.addCheckpoint(req.body.label)) return res.status(400).json({ error: 'Bot is not connected' });
  } else if (action === 'clear') {
    bot.route = [];
    bot.persist();
    bot.addLog('Route checkpoints cleared', 'warning');
  } else if (action === 'goto') {
    const point = bot.route[Number(req.body.index)];
    if (!point) return res.status(404).json({ error: 'Checkpoint not found' });
    if (!bot.bot?.entity) return res.status(400).json({ error: 'Bot is not connected' });
    bot.stopMovement();
    bot.navigationMode = 'route';
    const goal = new goals.GoalNear(Math.floor(point.x), Math.floor(point.y), Math.floor(point.z), 1);
    bot.bot.pathfinder.setMovements(new Movements(bot.bot));
    const navigation = bot.bot.pathfinder.goto(goal);
    const timeout = new Promise((resolve, reject) => setTimeout(() => reject(new Error('timed out after 60 seconds')), 60000));
    Promise.race([navigation, timeout])
      .then(() => {
        bot.navigationMode = 'idle';
        bot.addLog(`Reached route checkpoint: ${point.label}`, 'success');
      })
      .catch(error => {
        bot.navigationMode = 'idle';
        bot.bot?.pathfinder?.setGoal(null);
        bot.addLog(`Could not reach ${point.label}: ${error.message}`, 'error');
      });
    bot.addLog(`Walking to checkpoint: ${point.label}`, 'system');
  } else {
    return res.status(404).json({ error: 'Unknown route action' });
  }
  bot.emitRoute();
  res.json({ recording: bot.routeRecording, points: bot.route });
});

app.post('/api/action/:action', requireAuth, async (req, res) => {
  const bot = await botFor(req, res); if (!bot) return;
  const { action } = req.params;
  if (action === 'start' || action === 'reconnect') {
    if (!servers.isActive(await servers.getServer(req.session.serverId))) return res.status(403).json({ error: 'This bot is suspended or its time has run out. Contact the admin on Discord.' });
  }
  if (action === 'start') bot.start();
  else if (action === 'stop') bot.stop();
  else if (action === 'reconnect') bot.reconnect();
  else return res.status(404).json({ error: 'Unknown action' });
  res.json(bot.state);
});

// PERF: the 3D viewer (a full prismarine-viewer renderer per bot) only runs
// while someone actually has it open in the UI, not for the bot's whole
// connected lifetime — see the note above BotSession.startViewer().
app.post('/api/viewer/:action', requireAuth, async (req, res) => {
  const bot = await botFor(req, res); if (!bot) return;
  const { action } = req.params;
  if (action === 'start' && !servers.PLANS[(await servers.getServer(req.session.serverId)).plan].viewer) {
    return res.status(403).json({ error: 'The live 3D view needs a Pro or Premium plan.' });
  }
  if (action === 'start') {
    const result = bot.startViewer();
    if (!result.ok) return res.status(400).json({ error: result.error });
  } else if (action === 'stop') {
    bot.stopViewer();
  } else {
    return res.status(404).json({ error: 'Unknown viewer action' });
  }
  res.json({ viewerRunning: Boolean(bot.viewerPort) });
});

// ---------------------------------------------------------------------------
// Socket.io — authenticated via the same session cookie, each socket only
// joins its own user's private room.
// ---------------------------------------------------------------------------
io.use((socket, next) => {
  const user = socket.request.session?.user;
  if (!user) return next(new Error('unauthorized'));
  socket.user = user;
  next();
});

io.on('connection', async socket => {
  const sid = socket.request.session?.serverId, s = sid && await servers.getServer(sid);
  if (!s || s.ownerLower !== socket.user.username.toLowerCase()) return socket.disconnect();
  const bot = botManager.getOrCreate(s._id, io);
  socket.join(bot.room);
  socket.emit('state', bot.state);
  socket.emit('history', bot.logs);
  socket.emit('versions', bot.state.supportedVersions);
  socket.emit('route', { recording: bot.routeRecording, points: bot.route });
});

// ---------------------------------------------------------------------------
// Live 3D viewer — each connected bot runs its own prismarine-viewer server
// on a loopback-only internal port. We proxy it through the single public
// port so it works behind Railway/any PaaS without exposing extra ports.
// ---------------------------------------------------------------------------
function getViewerProxyForUser(username) {
  const bot = botManager.get(username);
  if (!bot?.viewerPort) return null;
  if (bot._viewerProxy && bot._viewerProxyPort === bot.viewerPort) return bot._viewerProxy;
  bot._viewerProxy = createProxyMiddleware({
    target: `http://127.0.0.1:${bot.viewerPort}`,
    changeOrigin: true,
    ws: true,
    pathRewrite: { '^/viewer': '' }
  });
  bot._viewerProxyPort = bot.viewerPort;
  return bot._viewerProxy;
}

app.use('/viewer', requireAuth, (req, res, next) => {
  const proxy = getViewerProxyForUser(req.session.serverId);
  if (!proxy) return res.status(503).send('Live view is not available yet. Start the bot and wait for it to connect.');
  return proxy(req, res, next);
});

// Express doesn't forward WebSocket 'upgrade' events to middleware on its
// own, so we handle it manually — reusing the same session cookie to figure
// out which user's (and therefore which internal port's) viewer to proxy to.
httpServer.on('upgrade', (request, socket, head) => {
  if (!request.url.startsWith('/viewer')) return; // let socket.io's own listener handle the rest
  const fakeRes = { getHeader() {}, setHeader() {}, end() {}, writeHead() {}, on() {}, once() {}, emit() {} };
  sessionMiddleware(request, fakeRes, () => {
    const sid = request.session?.serverId;
    const proxy = sid ? getViewerProxyForUser(sid) : null;
    if (!proxy) { socket.destroy(); return; }
    proxy.upgrade(request, socket, head);
  });
});


process.on('unhandledRejection', err => console.error('Unhandled rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

function shutdown() {
  console.log('Shutting down, disconnecting all bots...');
  for (const bot of botManager.all()) {
    try { bot.stop(); } catch (err) { console.error(err); }
  }
  db.close().catch(err => console.error(err)).finally(() => setTimeout(() => process.exit(0), 300));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// 404 handler (must come after every route)
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

const panelPort = Number(process.env.PORT || process.env.PANEL_PORT || 3000);
setInterval(() => { for (const bot of botManager.all()) bot.updateTelemetry(); }, 1000);
// Stop bots whose plan has run out.
setInterval(async () => {
  for (const bot of botManager.all()) {
    if (bot.state.status === 'offline') continue;
    try {
      if (!servers.isActive(await servers.getServer(bot.owner))) { bot.addLog('This bot is suspended or its time has run out, so it was stopped', 'warning'); bot.stop(); }
    } catch { /* database hiccup, check again next minute */ }
  }
}, 60000);

db.init().then(() => servers.init()).then(() => {
  httpServer.listen(panelPort, process.env.PANEL_HOST || '0.0.0.0', () => {
    console.log(`Control panel running on port ${panelPort}`);
    console.log(`Admin login: ${ADMIN_USERNAME}`);
  });
}).catch(err => {
  console.error('FATAL: could not connect to the database:', err.message);
  process.exit(1);
});
