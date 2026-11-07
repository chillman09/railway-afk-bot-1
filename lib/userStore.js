const bcrypt = require('bcryptjs');
const db = require('./db');

const pub = u => ({ username: u.username, role: u.role, createdAt: u.createdAt });
const findUser = username => db.users().findOne({ usernameLower: String(username).toLowerCase() });

async function createUser(username, password) {
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    throw new Error('Username must be 3-32 characters: letters, numbers, underscore, or hyphen only');
  }
  const lower = username.toLowerCase();
  if (lower === 'admin' || lower === (process.env.ADMIN_USERNAME || 'admin').toLowerCase()) throw new Error('That username is reserved for the admin account');
  const user = { username, usernameLower: lower, passwordHash: await bcrypt.hash(password, 10), role: 'user', createdAt: new Date().toISOString() };
  try {
    await db.users().insertOne(user);
  } catch (err) {
    if (err.code === 11000) throw new Error('That username already exists');
    throw err;
  }
  return pub(user);
}

async function deleteUser(username) {
  const user = await findUser(username);
  if (!user || user.role === 'admin') return false;
  await db.users().deleteOne({ _id: user._id });
  db.deleteBot(user.username);
  return true;
}

async function verifyUser(username, password) {
  const user = await findUser(username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return { username: user.username, role: user.role };
}

async function listUsers() {
  return (await db.users().find({ role: { $ne: 'admin' } }).sort({ createdAt: 1 }).toArray()).map(pub);
}

module.exports = { createUser, deleteUser, verifyUser, listUsers, findUser };
