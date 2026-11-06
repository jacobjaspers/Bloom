// Bloom desktop app. The same Bloom.exe runs in one of two roles:
//
//   Bloom.exe --service   The background helper that drives the lights. Started at
//                         sign-in by the "Bloom RGB" scheduled task with admin rights
//                         (needed for RAM lighting), no window.
//   Bloom.exe             The app people see: a window plus a tray icon. It talks to the
//                         helper at http://localhost:7420 and starts it if needed.

import { app, BrowserWindow, Menu, nativeImage, shell, Tray } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 7420;
const URL = `http://localhost:${PORT}`;
const TASK = 'Bloom RGB';
const isService = process.argv.includes('--service');
const startHidden = process.argv.includes('--hidden');
const appRoot = path.resolve(here, '..');
const iconPath = app.isPackaged ? path.join(process.resourcesPath, 'bloom.ico') : path.join(appRoot, 'assets', 'bloom.ico');

app.setAppUserModelId('com.jacobjaspers.bloom');

// Electron's own browser data goes in a subfolder per role, so the window and the
// helper never share (and lock) one profile, and %APPDATA%\Bloom stays tidy for
// Bloom's settings (scene.json, openrgb\).
app.setPath('userData', path.join(app.getPath('appData'), 'Bloom', isService ? 'electron-service' : 'electron-app'));

// ---- background helper ------------------------------------------------------------

if (isService) {
  // The helper has no console: keep its messages in %LOCALAPPDATA%\Bloom\bloom.log.
  const logDir = path.join(process.env.LOCALAPPDATA ?? app.getPath('userData'), 'Bloom');
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.createWriteStream(path.join(logDir, 'bloom.log'), { flags: 'w' });
  log.on('error', () => {
    /* log file busy or unwritable: carry on without it */
  });
  for (const level of ['log', 'warn', 'error'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      log.write(`${new Date().toISOString()} ${args.map(String).join(' ')}\n`);
      orig(...args);
    };
  }
  process.env.BLOOM_ROOT = appRoot;
  if (app.isPackaged) process.env.BLOOM_OPENRGB_DIR = path.join(process.resourcesPath, 'openrgb');
  app.on('window-all-closed', () => {
    /* the helper has no windows and keeps running */
  });
  // Don't await at the top level: Electron only fires 'ready' after this file finishes
  // loading, so awaiting it here would wait forever.
  // The bundled server sits next to this file in build/ (see scripts/build-app.mjs).
  const serverEntry = './server.mjs';
  void app.whenReady().then(() => import(serverEntry));
} else {
  runApp();
}

// ---- the app window + tray ----------------------------------------------------------

function portOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createConnection({ port: PORT, host: '127.0.0.1' });
    const done = (v: boolean) => {
      s.destroy();
      resolve(v);
    };
    s.setTimeout(400, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

/** Make sure the helper is running: start its sign-in task (no admin prompt needed). */
async function ensureHelper(): Promise<boolean> {
  if (await portOpen()) return true;
  await new Promise<void>((resolve) => execFile('schtasks.exe', ['/Run', '/TN', TASK], { windowsHide: true }, () => resolve()));
  for (let i = 0; i < 40; i++) {
    if (await portOpen()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

/** Flip the master on/off switch by editing the scene over the helper's WebSocket. */
function togglePower(): void {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { origin: URL } });
  ws.on('message', (data, binary) => {
    if (binary) return;
    const msg = JSON.parse(String(data));
    if (msg.type !== 'state') return;
    msg.scene.power = !msg.scene.power;
    ws.send(JSON.stringify({ type: 'scene', scene: msg.scene }), () => ws.close());
  });
  ws.on('error', () => ws.close());
}

function runApp(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  let win: BrowserWindow | null = null;
  let tray: Tray | null = null;
  let quitting = false;

  const show = () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  app.on('second-instance', show);
  app.on('before-quit', () => (quitting = true));
  app.on('window-all-closed', () => {
    /* stay in the tray */
  });

  app.whenReady().then(async () => {
    // First run of the installed app: start with Windows, quietly in the tray.
    // After that the tray's "Start with Windows" checkbox is the user's choice.
    const marker = path.join(app.getPath('userData'), 'login-item-set');
    if (app.isPackaged && !fs.existsSync(marker)) {
      app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
      fs.writeFileSync(marker, '');
    }

    win = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      show: false,
      backgroundColor: '#07080c',
      title: 'Bloom',
      icon: iconPath,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#07080c', symbolColor: '#c9ccd8', height: 60 },
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    win.removeMenu();
    win.webContents.setWindowOpenHandler(({ url }) => {
      // Links such as openrgb.org open in the user's browser, not inside Bloom.
      void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.on('close', (e) => {
      if (quitting) return;
      e.preventDefault();
      win?.hide();
    });

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml())}`);
    if (!startHidden) win.show();
    const ok = await ensureHelper();
    if (ok) await win.loadURL(URL);
    else await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(true))}`);

    tray = new Tray(nativeImage.createFromPath(iconPath));
    tray.setToolTip('Bloom');
    const menu = () =>
      Menu.buildFromTemplate([
        { label: 'Open Bloom', click: show },
        { label: 'Lighting on / off', click: togglePower },
        { type: 'separator' },
        {
          label: 'Start with Windows',
          type: 'checkbox',
          checked: app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
            tray?.setContextMenu(menu());
          },
        },
        { type: 'separator' },
        {
          label: 'Quit Bloom window',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]);
    tray.setContextMenu(menu());
    tray.on('click', show);
  });
}

function splashHtml(failed = false): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Bloom</title><style>
    html,body{height:100%;margin:0;background:#07080c;color:#8b90a5;font:14px "Segoe UI",system-ui,sans-serif;-webkit-app-region:drag}
    .c{height:100%;display:grid;place-content:center;justify-items:center;gap:14px}
    .r{width:46px;height:46px;border-radius:50%;background:conic-gradient(#00d8ff,#8b7bff,#ff4fa3,#00d8ff);
       -webkit-mask:radial-gradient(circle,transparent 15px,#000 16px);animation:s 1.2s linear infinite}
    @keyframes s{to{transform:rotate(360deg)}} b{color:#eceef5;font-weight:600}
  </style></head><body><div class="c"><div class="r"></div>${
    failed
      ? '<b>Bloom’s lighting service didn’t start</b><span>Try restarting your PC. If it keeps happening, reinstall Bloom.</span>'
      : '<b>Bloom</b><span>Waking up your lights…</span>'
  }</div></body></html>`;
}
