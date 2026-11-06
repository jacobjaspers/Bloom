// Runs the OpenRGB build bundled with Bloom (vendor\openrgb) as a hidden background
// SDK server, with its own settings folder. If an OpenRGB server is already listening
// (the user runs OpenRGB themselves), Bloom uses that one instead and starts nothing.

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { OPENRGB_DIR } from '../paths.ts';

export const OPENRGB_EXE = path.join(OPENRGB_DIR, 'OpenRGB.exe');
const CONFIG_DIR = path.join(process.env.APPDATA ?? path.join(os.homedir(), '.config'), 'Bloom', 'openrgb');

export function portOpen(port: number, host = '127.0.0.1', timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host });
    const done = (v: boolean) => {
      s.destroy();
      resolve(v);
    };
    s.setTimeout(timeoutMs, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

/**
 * Turn off OpenRGB's detectors for hardware Bloom already drives itself, so the two
 * programs never fight over one device. Other settings in the file are kept.
 */
function writeConfig(disabledDetectors: string[]): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const file = path.join(CONFIG_DIR, 'OpenRGB.json');
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    /* first run */
  }
  const det = ((cfg.Detectors as Record<string, unknown>) ??= {});
  const list = ((det.detectors as Record<string, boolean>) ??= {});
  for (const k of Object.keys(list)) if (list[k] === false && !disabledDetectors.includes(k)) list[k] = true;
  for (const name of disabledDetectors) list[name] = false;
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

export type OpenRgbSource = { kind: 'bundled'; proc: ChildProcess } | { kind: 'external' } | { kind: 'missing' };

/** Make sure an OpenRGB SDK server is reachable on `port`. */
export async function ensureOpenRgb(port: number, disabledDetectors: string[]): Promise<OpenRgbSource> {
  if (await portOpen(port)) return { kind: 'external' };
  if (!fs.existsSync(OPENRGB_EXE)) return { kind: 'missing' };
  writeConfig(disabledDetectors);
  const proc = spawn(
    OPENRGB_EXE,
    ['--server', '--server-port', String(port), '--noautoconnect', '--config', CONFIG_DIR],
    { cwd: path.dirname(OPENRGB_EXE), windowsHide: true, stdio: 'ignore' },
  );
  proc.on('error', (err) => console.warn('[bloom] could not start OpenRGB:', err.message));
  return { kind: 'bundled', proc };
}
