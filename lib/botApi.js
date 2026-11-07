// The bot-control operations, shared by the panel (for bots on its own node)
// and by node agents (for bots on remote nodes). Returns { status, json }.
const { Movements, goals } = require('mineflayer-pathfinder');

const ok = json => ({ status: 200, json });
const err = (status, error) => ({ status, json: { error } });

function route(bot, action, body) {
  if (action === 'start') {
    bot.routeRecording = true;
    bot.addLog('Route recording started', 'system');
  } else if (action === 'stop') {
    bot.routeRecording = false;
    bot.persist();
    bot.addLog(`Route recording stopped with ${bot.route.length} checkpoints`, 'system');
  } else if (action === 'checkpoint') {
    if (!bot.routeRecording) return err(400, 'Start route recording first');
    if (!bot.addCheckpoint(body.label)) return err(400, 'Bot is not connected');
  } else if (action === 'clear') {
    bot.route = [];
    bot.persist();
    bot.addLog('Route checkpoints cleared', 'warning');
  } else if (action === 'goto') {
    const point = bot.route[Number(body.index)];
    if (!point) return err(404, 'Checkpoint not found');
    if (!bot.bot?.entity) return err(400, 'Bot is not connected');
    bot.stopMovement();
    bot.navigationMode = 'route';
    const goal = new goals.GoalNear(Math.floor(point.x), Math.floor(point.y), Math.floor(point.z), 1);
    bot.bot.pathfinder.setMovements(new Movements(bot.bot));
    const navigation = bot.bot.pathfinder.goto(goal);
    const timeout = new Promise((resolve, reject) => setTimeout(() => reject(new Error('timed out after 60 seconds')), 60000));
    Promise.race([navigation, timeout])
      .then(() => { bot.navigationMode = 'idle'; bot.addLog(`Reached route checkpoint: ${point.label}`, 'success'); })
      .catch(error => { bot.navigationMode = 'idle'; bot.bot?.pathfinder?.setGoal(null); bot.addLog(`Could not reach ${point.label}: ${error.message}`, 'error'); });
    bot.addLog(`Walking to checkpoint: ${point.label}`, 'system');
  } else {
    return err(404, 'Unknown route action');
  }
  bot.emitRoute();
  return ok({ recording: bot.routeRecording, points: bot.route });
}

function handle(bot, kind, action, body) {
  body = body || {};
  switch (kind) {
    case 'state': return ok({ state: bot.state, logs: bot.logs, supportedVersions: bot.state.supportedVersions });
    case 'snapshot': return ok({ state: bot.state, logs: bot.logs, versions: bot.state.supportedVersions, route: { recording: bot.routeRecording, points: bot.route } });
    case 'chat': {
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!message) return err(400, 'Message is required');
      return ok({ sent: bot.sendChat(message) });
    }
    case 'config': {
      const result = bot.updateConfig(body);
      return result.ok ? ok({ state: bot.state }) : err(400, result.error);
    }
    case 'route': return route(bot, action, body);
    case 'action':
      if (action === 'start') bot.start();
      else if (action === 'stop') bot.stop();
      else if (action === 'reconnect') bot.reconnect();
      else return err(404, 'Unknown action');
      return ok(bot.state);
    case 'viewer':
      if (action === 'start') { const r = bot.startViewer(); if (!r.ok) return err(400, r.error); }
      else if (action === 'stop') bot.stopViewer();
      else return err(404, 'Unknown viewer action');
      return ok({ viewerRunning: Boolean(bot.viewerPort) });
    default: return err(404, 'Unknown request');
  }
}

module.exports = { handle };
