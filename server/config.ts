// Scene persistence (%APPDATA%\Lumen\scene.json) and defaults.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BUILTIN_PRESETS } from '../shared/presets.ts';
import { sanitizePresets, sanitizeStack } from '../shared/stack.ts';
import { clampPlacement } from '../shared/layout.ts';
import type { ColorOrder, EffectStack, Placement, Scene, ZoneInfo, ZoneSettings } from '../shared/types.ts';

const dir = path.join(process.env.APPDATA ?? path.join(os.homedir(), '.config'), 'Lumen');
let file = path.join(dir, 'scene.json');

/** Demo mode keeps its own file so it never overwrites the real rig's settings. */
export function useSceneFile(name: string): void {
  file = path.join(dir, name);
}

export function defaultEffect(): EffectStack {
  return structuredClone(BUILTIN_PRESETS[0].stack);
}

export function defaultZone(z: ZoneInfo): ZoneSettings {
  const base: ZoneSettings = {
    enabled: true,
    brightness: 100,
    synced: true,
    effect: defaultEffect(),
    colorOrder: 'RGB',
  };
  if (z.configurable) {
    // Matches the layout SignalRGB was configured with on this rig (40 LEDs per header).
    base.ledCount = 40;
    base.fanCount = z.id.endsWith('argb1') ? 3 : 1;
  }
  return base;
}

export function defaultScene(): Scene {
  return { power: true, brightness: 80, effect: defaultEffect(), zones: {}, presets: [], activePreset: BUILTIN_PRESETS[0].id };
}

export function loadScene(): Scene {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Scene>;
    // A saved scene only has an active preset if it recorded one.
    return { ...defaultScene(), activePreset: undefined, ...parsed, zones: parsed.zones ?? {} };
  } catch {
    return defaultScene();
  }
}

let pending: NodeJS.Timeout | null = null;
export function saveScene(scene: Scene): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(scene, null, 2));
    } catch (err) {
      console.warn('[lumen] could not save scene:', err);
    }
  }, 400);
}

const ORDERS: ColorOrder[] = ['RGB', 'RBG', 'GRB', 'GBR', 'BRG', 'BGR'];
const clamp = (v: unknown, lo: number, hi: number, def: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;

/** Make sure every known zone has settings, values are in range, and old formats are upgraded. */
export function reconcile(scene: Scene, zones: ZoneInfo[]): Scene {
  const next: Scene = structuredClone(scene);
  next.effect = sanitizeStack(next.effect, defaultEffect);
  next.presets = sanitizePresets(next.presets);
  next.brightness = clamp(next.brightness, 0, 100, 80);
  next.power = next.power !== false;
  if (typeof next.activePreset !== 'string') delete next.activePreset;
  next.parts = sanitizeParts(next.parts);

  for (const z of zones) {
    const cur = next.zones[z.id];
    const def = defaultZone(z);
    const s: ZoneSettings = cur ? { ...def, ...cur } : def;
    if (z.configurable) {
      s.ledCount = Math.round(clamp(s.ledCount, 1, z.maxLeds, 40));
      s.fanCount = Math.round(clamp(s.fanCount, 0, 8, 1));
    } else {
      delete s.ledCount;
      delete s.fanCount;
    }
    s.brightness = clamp(s.brightness, 0, 100, 100);
    s.effect = sanitizeStack(s.effect, () => structuredClone(next.effect));
    if (!ORDERS.includes(s.colorOrder)) s.colorOrder = 'RGB';
    const p = s.place as Partial<Placement> | undefined;
    if (p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      s.place = clampPlacement({ x: p.x, y: p.y, rot: (typeof p.rot === 'number' ? p.rot : 0) as Placement['rot'], scale: typeof p.scale === 'number' ? p.scale : 1 });
    } else {
      delete s.place;
    }
    next.zones[z.id] = s;
  }
  return next;
}

function sanitizeParts(v: unknown): Scene['parts'] {
  const out: NonNullable<Scene['parts']> = {};
  if (!v || typeof v !== 'object') return out;
  for (const id of ['cpu', 'board'] as const) {
    const p = (v as Record<string, Partial<Placement> | undefined>)[id];
    if (p && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      out[id] = clampPlacement({ x: p.x, y: p.y, rot: (typeof p.rot === 'number' ? p.rot : 0) as Placement['rot'], scale: typeof p.scale === 'number' ? p.scale : 1 });
    }
  }
  return out;
}
