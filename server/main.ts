// Bloom server: owns the hardware, runs the effect engine, serves the UI and
// streams live LED frames over a WebSocket. Binds to localhost only.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../shared/types.ts';
import { loadScene, useSceneFile } from './config.ts';
import { AsrockPolychrome } from './devices/asrock-polychrome.ts';
import { EneRam } from './devices/ene-ram.ts';
import { GigabyteGpu } from './devices/gigabyte-gpu.ts';
import { demoDevices } from './devices/simulated.ts';
import { Engine } from './engine.ts';

const demo = process.argv.includes('--demo');
const PORT = Number(process.env.BLOOM_PORT ?? 7420);
const here = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIST = path.join(here, '..', 'web', 'dist');

if (demo) useSceneFile('scene-demo.json');

const engine = new Engine(
  demo ? demoDevices() : [new AsrockPolychrome(), new EneRam(), new GigabyteGpu()],
  loadScene(),
);
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
  return { type: 'state', scene: engine.scene, zones: engine.zones, devices: engine.statuses(), demo };
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
