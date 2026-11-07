// MongoDB layer. Users/admin/sessions/bot configs all live in an external
// database (e.g. MongoDB Atlas), so nothing depends on the host's disk.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const DB_NAME = process.env.MONGODB_DB || 'aurora';
let clientPromise = null;
let db = null;
let encKey = null;
const bots = new Map();      // username -> bot config (kept in memory, written behind to Mongo)
const dirty = new Set();
let timer = null;

function connect() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!clientPromise) clientPromise = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 }).connect();
  return clientPromise;
}

// ---- encryption for the bot's server password (AES-256-GCM) ----
function key() {
  if (encKey) return encKey;
  const raw = process.env.DATA_ENCRYPTION_KEY;
  if (raw) {
    encKey = Buffer.from(raw, 'hex');
    if (encKey.length !== 32) throw new Error('DATA_ENCRYPTION_KEY must be 64 hex characters');
  } else {
    console.warn('WARNING: DATA_ENCRYPTION_KEY not set; deriving the encryption key from SESSION_SECRET. Changing SESSION_SECRET would make saved bot passwords unreadable.');
    encKey = crypto.scryptSync(process.env.SESSION_SECRET || '', 'aurora-bot-data', 32);
  }
  return encKey;
}
function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `enc:v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}
function decrypt(text) {
  if (!text || !String(text).startsWith('enc:v1:')) return text || '';
  try {
    const [, , iv, tag, ct] = text.split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  } catch {
    console.error('Could not decrypt a saved bot password (wrong key?).');
    return '';
  }
}

const users = () => db.collection('users');
const botCol = () => db.collection('bots');
const codes = () => db.collection('codes');
const settings = () => db.collection('settings');

async function seedAdmin() {
  const name = process.env.ADMIN_USERNAME || 'admin', pw = process.env.ADMIN_PASSWORD;
  const existing = await users().findOne({ role: 'admin' });
  if (!existing) {
    await users().insertOne({ username: name, usernameLower: name.toLowerCase(), passwordHash: await bcrypt.hash(pw, 10), role: 'admin', createdAt: new Date().toISOString() });
    console.log(`Admin account "${name}" created in the database.`);
  } else if (process.env.RESET_ADMIN_PASSWORD === 'true') {
    await users().updateOne({ _id: existing._id }, { $set: { username: name, usernameLower: name.toLowerCase(), passwordHash: await bcrypt.hash(pw, 10) } });
    console.warn('Admin password reset from ADMIN_PASSWORD. Remove RESET_ADMIN_PASSWORD now, or it resets on every boot.');
  }
}

// One-time import of the old file-based data (only runs if those files exist).
async function migrateFiles() {
  const dir = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, '..', 'data');
  let n = 0;
  try {
    const old = JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8'));
    for (const u of old) {
      try { await users().insertOne({ username: u.username, usernameLower: u.username.toLowerCase(), passwordHash: u.passwordHash, role: 'user', createdAt: u.createdAt || new Date().toISOString() }); n++; } catch { /* already imported */ }
    }
  } catch { /* no old users file */ }
  let b = 0;
  try {
    for (const f of fs.readdirSync(path.join(dir, 'bots')).filter(f => f.endsWith('.json'))) {
      const name = f.slice(0, -5);
      if (await botCol().findOne({ _id: name })) continue;
      const data = JSON.parse(fs.readFileSync(path.join(dir, 'bots', f), 'utf8'));
      await botCol().insertOne({ _id: name, ...data, password: encrypt(data.password) }); b++;
    }
  } catch { /* no old bots dir */ }
  if (n || b) console.log(`Imported ${n} user(s) and ${b} bot config(s) from local files into the database.`);
}

async function init() {
  db = (await connect()).db(DB_NAME);
  await users().createIndex({ usernameLower: 1 }, { unique: true });
  await seedAdmin();
  await migrateFiles();
  for await (const d of botCol().find()) { const { _id, ...rest } = d; bots.set(_id, { ...rest, password: decrypt(rest.password) }); }
  console.log(`Database ready (${DB_NAME}), ${bots.size} saved bot config(s) loaded.`);
}

// ---- bot configs: synchronous reads/writes against memory, async write-behind to Mongo ----
const getBot = name => bots.get(name) || {};
function saveBot(name, data) { bots.set(name, data); dirty.add(name); schedule(); }
function deleteBot(name) { bots.delete(name); dirty.add(name); schedule(); }
function schedule() { if (!timer) timer = setTimeout(() => flush().catch(() => {}), 500); }
async function flush() {
  clearTimeout(timer); timer = null;
  const names = [...dirty]; dirty.clear();
  await Promise.all(names.map(async n => {
    const d = bots.get(n);
    try {
      if (!d) await botCol().deleteOne({ _id: n });
      else await botCol().replaceOne({ _id: n }, { ...d, password: encrypt(d.password) }, { upsert: true });
    } catch (err) { console.error(`Database save failed for "${n}": ${err.message}`); dirty.add(n); schedule(); }
  }));
}
async function close() { await flush(); if (clientPromise) await (await clientPromise).close(); }

module.exports = { connect, init, flush, close, users, codes, settings, getBot, saveBot, deleteBot };
