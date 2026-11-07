// Panel side of the node system: remote node agents connect here with a token.
const crypto = require('crypto');
const db = require('./db');
const state = require('./nodeState');

const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const owners = new Map(); // serverId -> { nodeId, at }  (short cache)

async function nodeOf(serverId) {
  const hit = owners.get(serverId);
  if (hit && Date.now() - hit.at < 30000) return hit.nodeId;
  const s = await db.col('servers').findOne({ _id: serverId });
  owners.set(serverId, { nodeId: s ? s.nodeId : null, at: Date.now() });
  return s ? s.nodeId : null;
}

function attach(io) {
  const ns = io.of('/node');
  ns.use(async (socket, next) => {
    const node = await db.col('nodes').findOne({ tokenHash: hash((socket.handshake.auth || {}).token || ''), enabled: true }).catch(() => null);
    if (!node) return next(new Error('unauthorized'));
    socket.nodeId = node._id;
    next();
  });
  ns.on('connection', socket => {
    const old = state.sockets.get(socket.nodeId);
    if (old && old !== socket) old.disconnect(true);
    state.sockets.set(socket.nodeId, socket);
    console.log(`Node "${socket.nodeId}" connected.`);
    // A node may only speak for bots that are assigned to it.
    const mine = async room => typeof room === 'string' && room.startsWith('bot:') && (await nodeOf(room.slice(4))) === socket.nodeId;
    socket.on('evt', async ({ room, ev, payload } = {}) => { if (typeof ev === 'string' && await mine(room)) io.to(room).emit(ev, payload); });
    socket.on('save', async ({ id, data } = {}) => { if (data && typeof data === 'object' && await mine(`bot:${id}`)) db.saveBot(String(id), data); });
    socket.on('stats', s => state.stats.set(socket.nodeId, { ...s, at: Date.now() }));
    socket.on('disconnect', () => {
      if (state.sockets.get(socket.nodeId) === socket) { state.sockets.delete(socket.nodeId); state.stats.delete(socket.nodeId); }
      console.log(`Node "${socket.nodeId}" disconnected.`);
    });
  });
}

function rpc(nodeId, payload) {
  const sock = state.sockets.get(nodeId);
  if (!sock) return Promise.resolve({ status: 503, json: { error: "This bot's node is offline right now" } });
  return new Promise(resolve => sock.timeout(15000).emit('rpc', payload, (e, r) => resolve(e || !r ? { status: 504, json: { error: 'The node did not respond in time' } } : r)));
}

async function createNode(name, maxBots) {
  name = String(name || '').trim().slice(0, 40);
  maxBots = Number(maxBots);
  if (!name) throw new Error('Give the node a name');
  if (!Number.isInteger(maxBots) || maxBots < 1 || maxBots > 1000) throw new Error('Max bots must be between 1 and 1000');
  const token = 'ndk_' + crypto.randomBytes(24).toString('hex');
  const id = crypto.randomBytes(4).toString('hex');
  await db.col('nodes').insertOne({ _id: id, name, maxBots, enabled: true, tokenHash: hash(token), createdAt: new Date().toISOString() });
  return { id, token }; // the token is shown once; only its hash is stored
}

async function deleteNode(id) {
  if (id === 'local') throw new Error('The main node cannot be removed');
  if (await db.col('servers').findOne({ nodeId: id })) throw new Error('Move or delete the bots on this node first');
  await db.col('nodes').deleteOne({ _id: id });
  const s = state.sockets.get(id); if (s) s.disconnect(true);
}

module.exports = { attach, rpc, createNode, deleteNode };
