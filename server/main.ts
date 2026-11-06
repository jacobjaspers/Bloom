// Bloom server: owns the hardware, runs the effect engine, serves the UI and
// streams live LED frames over a WebSocket. Binds to localhost only.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/types.ts';
import { loadScene, useSceneFile } from './config.ts';
import { AsrockPolychrome } from './devices/asrock-polychrome.ts';
import { EneRam } from './devices/ene-ram.ts';
import { GigabyteGpu } from './devices/gigabyte-gpu.ts';
import { OpenRgbDevices } from './devices/openrgb.ts';
import { demoDevices } from './devices/simulated.ts';
import { Engine } from './engine.ts';
import { WEB_DIST } from './paths.ts';
import { watchConflicts } from './conflicts.ts';

const demo = process.argv.includes('--demo');
const PORT = Number(process.env.BLOOM_PORT ?? 7420);

if (demo) useSceneFile('scene-demo.json');

// Bloom's own drivers first; OpenRGB then handles every other device (and skips these).
// BLOOM_NATIVE=0 hands everything to OpenRGB; BLOOM_OPENRGB=0 turns OpenRGB off.
function hardware() {
  const native = process.env.BLOOM_NATIVE === '0' ? [] : [new AsrockPolychrome(), new EneRam(), new GigabyteGpu()];
  const nativeConnected = () => new Set(native.filter((d) => d.status().state === 'connected').map((d) => d.id));
  return process.env.BLOOM_OPENRGB === '0' ? native : [...native, new OpenRgbDevices(nativeConnected)];
}

const engine = new Engine(demo ? demoDevices() : hardware(), loadScene());
await engine.open();
engine.start();

// ---- static files -----------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = path.normalize(path.join(WEB_DIST, decodeURIComponent(url.pathname)));
  if (!file.startsWith(WEB_DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(WEB_DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain' }).end('UI not built yet. Run `npm run build`, or `npm run dev:web` for development.');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// ---- websocket --------------------------------------------------------------

const wss = new WebSocketServer({ server, path: '/ws' });

function stateMessage(): ServerMessage {
  return { type: 'state', scene: engine.scene, zones: engine.zones, devices: engine.statuses(), demo, conflicts: conflicts.current() };
}

function broadcast(msg: ServerMessage, except?: WebSocket) {
  const data = JSON.stringify(msg);
  for (const c of wss.clients) if (c !== except && c.readyState === c.OPEN) c.send(data);
}

wss.on('connection', (ws, req) => {
  // Only accept pages served from this machine.
  const origin = req.headers.origin ?? '';
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
    ws.close(1008, 'origin not allowed');
    return;
  }
  ws.send(JSON.stringify(stateMessage()));
  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return;
    }
    if (msg.type === 'scene') {
      const zonesBefore = JSON.stringify(engine.zones.map((z) => [z.id, z.ledCount]));
      engine.setScene(msg.scene);
      const zonesAfter = JSON.stringify(engine.zones.map((z) => [z.id, z.ledCount]));
      // The sender already has this scene; others need it. If the LED layout
      // changed, everyone (including the sender) needs the new zone table.
      if (zonesBefore !== zonesAfter) broadcast(stateMessage());
      else broadcast(stateMessage(), ws);
    } else if (msg.type === 'identify') {
      engine.identify(msg.zoneId);
    }
  });
});

// New devices from OpenRGB (or lost ones) need a fresh zone table in every window.
engine.onZonesChanged = () => broadcast(stateMessage());

// Warn about other RGB apps (SignalRGB, iCUE…) that would fight Bloom for the lights.
const conflicts = demo ? { current: () => [] as string[] } : watchConflicts(() => broadcast(stateMessage()));

engine.onFrame = (frame) => {
  for (const c of wss.clients) {
    // Skip clients that are falling behind instead of buffering frames.
    if (c.readyState === c.OPEN && c.bufferedAmount < 64 * 1024) c.send(frame);
  }
};

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bloom] ${demo ? 'DEMO MODE · ' : ''}control panel → http://localhost:${PORT}`);
});

function shutdown() {
  engine.shutdown();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
