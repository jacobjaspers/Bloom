// Scene persistence (%APPDATA%\Lumen\scene.json) and defaults.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EFFECT_BY_ID } from '../shared/effects.ts';
import type { EffectConfig, Scene, ZoneInfo, ZoneSettings } from '../shared/types.ts';

const dir = path.join(process.env.APPDATA ?? path.join(os.homedir(), '.config'), 'Lumen');
const file = path.join(dir, 'scene.json');

export function defaultEffect(): EffectConfig {
  return structuredClone(EFFECT_BY_ID.aurora.defaults);
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
  return { power: true, brightness: 80, effect: defaultEffect(), zones: {} };
}

export function loadScene(): Scene {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Scene>;
    return { ...defaultScene(), ...parsed, zones: parsed.zones ?? {} };
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

/** Make sure every known zone has settings and that values are in range. */
export function reconcile(scene: Scene, zones: ZoneInfo[]): Scene {
  const next: Scene = structuredClone(scene);
  for (const z of zones) {
    const cur = next.zones[z.id];
    const def = defaultZone(z);
    const s: ZoneSettings = cur ? { ...def, ...cur } : def;
    if (z.configurable) {
      s.ledCount = Math.max(1, Math.min(z.maxLeds, Math.round(s.ledCount ?? 40)));
      s.fanCount = Math.max(0, Math.min(8, Math.round(s.fanCount ?? 1)));
    } else {
      delete s.ledCount;
      delete s.fanCount;
    }
    s.brightness = Math.max(0, Math.min(100, s.brightness));
    if (!EFFECT_BY_ID[s.effect?.id]) s.effect = defaultEffect();
    next.zones[z.id] = s;
  }
  next.brightness = Math.max(0, Math.min(100, next.brightness));
  if (!EFFECT_BY_ID[next.effect?.id]) next.effect = defaultEffect();
  return next;
}
