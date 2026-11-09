<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aurora Bot / Control</title>
    <link rel="icon" type="image/png" href="/aurora-bot.png">
    <link rel="stylesheet" href="/styles.css">
    <link rel="stylesheet" href="/pro.css">
  </head>
  <body data-loading>
<div class="app">
<aside class="side">
  <div class="brand"><img class="brand-mark" src="/aurora-bot.png" alt="Aurora Bot"><span>Aurora Bot</span></div>
  <button class="tab active" data-tab="console"><i>&gt;_</i><span>Console</span></button>
  <button class="tab" data-tab="route"><i>⚑</i><span>Route</span></button>
  <button class="tab" data-tab="live"><i>◉</i><span>Live view</span></button>
  <button class="tab" data-tab="settings"><i>⚙</i><span>Settings</span></button>
  <div class="side-foot">
    <span class="clock" id="clock">--:--</span>
    <span class="user-chip" id="plan-chip" title="Current bot">Bot</span><a class="admin-link" href="/servers">Switch bot</a>
    <a class="admin-link" id="admin-link" href="/admin" hidden>Admin</a>
    <span class="user-chip" id="user-chip">--</span>
    <button class="logout-button" id="logout-button" title="Log out">Log out</button>
  </div>
</aside>
<main class="main">
<section class="view active" data-view="console">
  <div class="banner panel">
    <div class="orb"><span class="mark" id="status-mark"></span></div>
    <div class="banner-info">
      <span class="status-label">Connection</span>
      <strong id="status">Offline</strong>
      <span id="endpoint">pmcnet.in:19132 · Java 1.21.11</span>
    </div>
    <div class="quick">
      <button class="button button-primary" data-action="start">Start <span>→</span></button>
      <button class="button" data-action="reconnect">Reconnect <span>↻</span></button>
      <button class="button button-danger" data-action="stop">Stop <span>×</span></button>
    </div>
  </div>
  <div class="metrics">
    <div class="metric"><span>Bot account</span><strong id="username">--</strong></div>
    <div class="metric"><span>Last event</span><strong id="last-event">Waiting to connect</strong></div>
    <div class="metric"><span>Mode</span><strong id="navigation-mode">Idle</strong></div>
  </div>
  <div class="panel vitals">
    <div class="spec-grid">
      <div class="spec"><span>Health</span><strong id="health">--</strong><small>/ 20</small></div>
      <div class="spec"><span>Hunger</span><strong id="food">--</strong><small>/ 20</small></div>
      <div class="spec"><span>Position</span><strong id="position">--</strong></div>
      <div class="spec"><span>Latency</span><strong id="ping">--</strong><small>ms</small></div>
    </div>
  </div>
  <div class="dash-row">
    <div class="panel"><div class="telemetry-heading"><h3>Uptime &amp; latency</h3><strong id="uptime">Offline</strong></div><canvas id="ping-graph"></canvas></div>
    <div class="panel"><div class="telemetry-heading"><h3>Bot map</h3><strong id="map-pos">--</strong></div><canvas id="bot-map"></canvas></div>
  </div>
  <div class="panel console-panel">
    <div class="panel-heading"><h2>Live console <button class="info-button" data-tooltip="Server messages, bot events, and commands sent from this panel." aria-label="About live console">i</button></h2><span class="event-count" id="event-count">0 events</span></div>
    <div class="console" id="console" aria-live="polite"></div>
    <form class="command-form" id="command-form" style="margin-bottom:0"><span class="prompt-symbol">›</span><input id="command" autocomplete="off" placeholder="Send a Minecraft command or message..."><button type="submit" title="Send command">Send ↵</button></form>
  </div>
</section>

<section class="view" data-view="route">
  <div class="panel route-section" style="border-top:2px solid var(--line);margin-top:0;padding-top:20px">
    <div class="subheading"><h3>Farm route <span class="beta-badge">Beta</span></h3><button class="info-button" data-tooltip="Save walkable positions and send the bot to them with pathfinding." aria-label="About farm route">i</button></div>
    <div class="route-status"><span class="route-indicator" id="route-indicator"></span><span id="route-status">Not recording</span><strong id="route-count">0 points</strong></div>
    <div class="route-actions"><button class="button button-record" data-route="start">Record route <span>●</span></button><button class="button" data-route="stop">Stop recording <span>■</span></button></div>
    <div class="checkpoint-row"><input id="checkpoint-label" placeholder="Checkpoint name"><button class="button" data-route="checkpoint">Save point <span>+</span></button></div>
    <div class="route-list" id="route-list"><span class="empty-route">No checkpoints saved</span></div>
    <button class="clear-route" data-route="clear">Clear saved route</button>
  </div>
</section>

<section class="view" data-view="live">
  <div class="panel live-view" style="margin-top:0">
    <div class="telemetry-heading"><h3>Live view</h3><button class="info-button" data-tooltip="A live 3D render of what your bot sees, streamed straight from the Minecraft world." aria-label="About live view">i</button></div>
    <button class="button" id="toggle-viewer" disabled>Open 3D view <span>▶</span></button>
    <div class="viewer-frame-wrap" id="viewer-frame-wrap" hidden><iframe id="viewer-frame" class="viewer-frame" title="Live 3D view" loading="lazy"></iframe></div>
  </div>
</section>

<section class="view" data-view="settings">
  <form class="panel config-form" id="config-form" style="border-top:2px solid var(--line);margin-top:0">
    <div class="subheading"><h3>Server settings</h3><button type="button" class="info-button" data-tooltip="Change the server address, port, account, version, or login password." aria-label="About server settings">i</button></div>
    <label>Server address<input id="config-host" required></label>
    <label>Port<input id="config-port" type="number" min="1" max="65535" required></label>
    <label>Bot username<input id="config-username" required></label>
    <label>Version<select id="config-version" required></select></label>
    <label>Password<input id="config-password" type="password" placeholder="Leave unchanged"></label>
    <label class="toggle-row" for="config-use-proxy"><span>Connect through SOCKS5 proxy</span><input id="config-use-proxy" type="checkbox"></label>
    <button class="button button-save" type="submit">Save settings <span>✓</span></button>
    <p class="form-message" id="form-message"></p>
  </form>
  <div class="panel" style="margin-top:18px">
    <div class="telemetry-heading"><h3>Appearance</h3></div>
    <div class="themes">
      <button type="button" class="theme-btn" data-theme-btn="aurora"><i style="background:linear-gradient(135deg,#7f4dff,#5dffb4)"></i>Aurora</button>
      <button type="button" class="theme-btn" data-theme-btn="nether"><i style="background:linear-gradient(135deg,#d9381e,#ffc857)"></i>Nether</button>
      <button type="button" class="theme-btn" data-theme-btn="end"><i style="background:linear-gradient(135deg,#9b5cf0,#8fe3ff)"></i>End</button>
    </div>
    <label class="toggle-row" for="sound-toggle"><span>Sound effects</span><input id="sound-toggle" type="checkbox"></label>
  </div>
  <div class="panel runtime-summary" style="margin-top:18px">
    <div class="telemetry-heading"><h3>Runtime profile</h3></div>
    <div class="runtime-list"><div><span>Authentication</span><strong>Automatic login</strong></div><div><span>AFK behavior</span><strong>Pathfinder movement</strong></div><div><span>Farming automation</span><strong class="planned">Planned</strong></div></div>
  </div>
</section>
<footer class="footer"><span>Aurora Bot</span><span>Built by <strong>thecoolguy0077</strong></span><a href="https://discord.com/users/1354472117646786763" target="_blank" rel="noreferrer">Discord profile ↗</a></footer>
</main>
</div>
<script src="/socket.io/socket.io.js"></script>
    <script src="/auth-nav.js"></script>
    <script src="/app.js"></script>
      <script src="/plan-ui.js"></script>
    <script src="/fx.js"></script>
  </body>
</html>
