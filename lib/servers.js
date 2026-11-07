// Pterodactyl-style model: the admin (or a redeemed code) creates "servers" (bots),
// each owned by a user and placed on a node. A user can own many.
const crypto = require('crypto');
const db = require('./db');

const DAY = 864e5;
const PLANS = {
  basic:   { label: 'Basic',   viewer: false },
  pro:     { label: 'Pro',     viewer: true },
  premium: { label: 'Premium', viewer: true }
};
const servers = () => db.col('servers');
const nodes = () => db.col('nodes');

async function init() {
  await servers().createIndex({ ownerLower: 1 });
  if (!(await nodes().findOne({ _id: 'local' }))) await nodes().insertOne({ _id: 'local', name: 'Main node', maxBots: 20, enabled: true });
}

const isActive = s => Boolean(s) && !s.suspended && (!s.until || new Date(s.until) > new Date());

// Nodes with how many bots they hold, emptiest first (the "preferred" node sits on top).
async function listNodes() {
  const counts = Object.fromEntries((await servers().aggregate([{ $group: { _id: '$nodeId', n: { $sum: 1 } } }]).toArray()).map(r => [r._id, r.n]));
  return (await nodes().find().toArray()).map(n => ({ id: n._id, name: n.name, maxBots: n.maxBots, enabled: n.enabled, used: counts[n._id] || 0 }))
    .sort((a, b) => (b.enabled - a.enabled) || ((b.maxBots - b.used) - (a.maxBots - a.used)));
}

async function createServer({ owner, name, nodeId, plan, days }) {
  if (!PLANS[plan]) throw new Error('Choose Basic, Pro or Premium');
  const user = await db.users().findOne({ usernameLower: String(owner || '').toLowerCase() });
  if (!user) throw new Error('Owner not found');
  name = String(name || '').trim().slice(0, 40) || `${PLANS[plan].label} bot`;
  const list = await listNodes();
  const node = !nodeId || nodeId === 'auto' ? list.find(n => n.enabled && n.used < n.maxBots) : list.find(n => n.id === nodeId);
  if (!node || !node.enabled) throw new Error('No node available');
  if (node.used >= node.maxBots) throw new Error(`${node.name} is full`);
  days = days === '' || days === null || days === undefined ? null : Number(days);
  if (days !== null && (!Number.isFinite(days) || days < 1 || days > 3650)) throw new Error('Days must be between 1 and 3650 (blank = no expiry)');
  const doc = { _id: crypto.randomBytes(4).toString('hex'), owner: user.username, ownerLower: user.usernameLower, name, nodeId: node.id, plan, until: days ? new Date(Date.now() + days * DAY).toISOString() : null, suspended: false, createdAt: new Date().toISOString() };
  await servers().insertOne(doc);
  return doc;
}

const getServer = id => servers().findOne({ _id: String(id) });
const listForOwner = username => servers().find({ ownerLower: String(username).toLowerCase() }).sort({ createdAt: 1 }).toArray();
const listAll = () => servers().find().sort({ createdAt: -1 }).limit(500).toArray();
async function deleteServer(id) { const r = await servers().deleteOne({ _id: String(id) }); if (r.deletedCount) db.deleteBot(String(id)); return r.deletedCount > 0; }
async function deleteForOwner(username) {
  const list = await listForOwner(username);
  for (const s of list) await deleteServer(s._id);
  return list.map(s => s._id);
}
async function toggleSuspend(id) { const s = await getServer(id); if (!s) throw new Error('Server not found'); await servers().updateOne({ _id: s._id }, { $set: { suspended: !s.suspended } }); return !s.suspended; }
async function renew(id, days) {
  days = Number(days); if (!Number.isFinite(days) || days < 1 || days > 3650) throw new Error('Days must be between 1 and 3650');
  const s = await getServer(id); if (!s) throw new Error('Server not found');
  const base = s.until && new Date(s.until) > new Date() ? new Date(s.until).getTime() : Date.now();
  await servers().updateOne({ _id: s._id }, { $set: { until: new Date(base + days * DAY).toISOString() } });
}

// ---- access codes: redeeming one creates a bot (server) for the user ----
async function redeemCode(username, raw) {
  const code = String(raw || '').trim().toUpperCase(), lower = String(username).toLowerCase(), now = new Date().toISOString();
  const doc = await db.codes().findOneAndUpdate({
    _id: code, disabled: false, redeemedBy: { $ne: lower },
    $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }, { $or: [{ maxUses: null }, { $expr: { $lt: ['$uses', '$maxUses'] } }] }]
  }, { $inc: { uses: 1 }, $push: { redeemedBy: lower } }, { returnDocument: 'after' });
  if (!doc) throw new Error('That code is invalid, expired, fully used, or already redeemed on your account');
  try {
    return await createServer({ owner: username, name: '', nodeId: 'auto', plan: doc.plan, days: doc.days });
  } catch (err) {
    await db.codes().updateOne({ _id: code }, { $inc: { uses: -1 }, $pull: { redeemedBy: lower } });
    throw err;
  }
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const part = n => Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
async function createCodes({ plan, days, maxUses, expiresAt, note, count }) {
  if (!PLANS[plan]) throw new Error('Choose Basic, Pro or Premium');
  days = Number(days); count = Math.min(50, Math.max(1, Number(count) || 1));
  if (!Number.isFinite(days) || days < 1 || days > 3650) throw new Error('Days must be between 1 and 3650');
  maxUses = maxUses === null || maxUses === '' || maxUses === undefined ? null : Number(maxUses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) throw new Error('Max redemptions must be 1 or more (or blank for unlimited)');
  if (expiresAt && Number.isNaN(Date.parse(expiresAt))) throw new Error('Invalid expiry date');
  const made = [];
  for (let i = 0; i < count; i++) {
    const doc = { _id: `AUR-${part(4)}-${part(4)}`, plan, days, maxUses, uses: 0, expiresAt: expiresAt || null, disabled: false, note: String(note || '').slice(0, 80), redeemedBy: [], createdAt: new Date().toISOString() };
    await db.codes().insertOne(doc); made.push(doc);
  }
  return made;
}
const listCodes = () => db.codes().find().sort({ createdAt: -1 }).limit(300).toArray();
async function toggleCode(code) {
  const doc = await db.codes().findOne({ _id: String(code).toUpperCase() });
  if (!doc) throw new Error('Code not found');
  await db.codes().updateOne({ _id: doc._id }, { $set: { disabled: !doc.disabled } });
  return !doc.disabled;
}
async function registrationOpen() { const s = await db.settings().findOne({ _id: 'main' }); return s ? s.registrationOpen !== false : true; }
const setRegistrationOpen = open => db.settings().updateOne({ _id: 'main' }, { $set: { registrationOpen: Boolean(open) } }, { upsert: true });

module.exports = { PLANS, init, isActive, listNodes, createServer, getServer, listForOwner, listAll, deleteServer, deleteForOwner, toggleSuspend, renew, redeemCode, createCodes, listCodes, toggleCode, registrationOpen, setRegistrationOpen };
