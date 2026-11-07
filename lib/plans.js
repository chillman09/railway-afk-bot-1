// Plans, access codes and the registration switch.
const crypto = require('crypto');
const db = require('./db');

const DAY = 864e5;
const PLANS = {
  free:    { label: 'Free',    rank: 0, bots: 0, viewer: false },
  basic:   { label: 'Basic',   rank: 1, bots: 1, viewer: false },
  pro:     { label: 'Pro',     rank: 2, bots: 1, viewer: true },
  premium: { label: 'Premium', rank: 3, bots: 1, viewer: true }
};

// What a user may do right now. Admins always get everything.
function entitlement(user) {
  if (user && user.role === 'admin') return { plan: 'premium', ...PLANS.premium, until: null, admin: true };
  const live = user && PLANS[user.plan] && user.planUntil && new Date(user.planUntil) > new Date();
  const plan = live ? user.plan : 'free';
  return { plan, ...PLANS[plan], until: live ? user.planUntil : null };
}

async function setPlan(username, plan, days) {
  if (!PLANS[plan]) throw new Error('Unknown plan');
  const filter = { usernameLower: String(username).toLowerCase(), role: 'user' };
  if (plan === 'free') {
    const r = await db.users().updateOne(filter, { $set: { plan: 'free', planUntil: null } });
    if (!r.matchedCount) throw new Error('User not found');
    return;
  }
  days = Number(days);
  if (!Number.isFinite(days) || days < 1 || days > 3650) throw new Error('Days must be between 1 and 3650');
  const r = await db.users().updateOne(filter, { $set: { plan, planUntil: new Date(Date.now() + days * DAY).toISOString() } });
  if (!r.matchedCount) throw new Error('User not found');
}

async function redeemCode(username, raw) {
  const code = String(raw || '').trim().toUpperCase();
  const lower = String(username).toLowerCase(), now = new Date().toISOString();
  const doc = await db.codes().findOneAndUpdate({
    _id: code, disabled: false, redeemedBy: { $ne: lower },
    $and: [
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      { $or: [{ maxUses: null }, { $expr: { $lt: ['$uses', '$maxUses'] } }] }
    ]
  }, { $inc: { uses: 1 }, $push: { redeemedBy: lower } }, { returnDocument: 'after' });
  if (!doc) throw new Error('That code is invalid, expired, fully used, or already redeemed on your account');
  const user = await db.users().findOne({ usernameLower: lower });
  const cur = entitlement(user);
  // Same plan still running: add time on top. Otherwise start the new plan now.
  const base = cur.plan === doc.plan && cur.until ? new Date(cur.until).getTime() : Date.now();
  const until = new Date(base + doc.days * DAY).toISOString();
  await db.users().updateOne({ _id: user._id }, { $set: { plan: doc.plan, planUntil: until } });
  return { plan: doc.plan, until };
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const part = n => Array.from({ length: n }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

async function createCodes({ plan, days, maxUses, expiresAt, note, count }) {
  if (!PLANS[plan] || plan === 'free') throw new Error('Choose Basic, Pro or Premium');
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

module.exports = { PLANS, entitlement, setPlan, redeemCode, createCodes, listCodes, toggleCode, registrationOpen, setRegistrationOpen };
