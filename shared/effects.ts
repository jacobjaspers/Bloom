// Effect library. Every effect is a pure function of (time, LED position) → color,
// so the same code drives the hardware and the animated thumbnails in the UI.

import { clamp01, fract, hexToRgb, hsv, mix, palette, scale, smooth } from './color.ts';
import type { LedPoint } from './layout.ts';
import type { EffectConfig, EffectId, RGB } from './types.ts';

export interface EffectMeta {
  id: EffectId;
  name: string;
  blurb: string;
  /** Number of color slots the effect exposes (0 = generates its own colors). */
  colorSlots: number;
  uses: { speed: boolean; size: boolean; direction: boolean };
  defaults: EffectConfig;
}

const fx = (
  id: EffectId,
  name: string,
  blurb: string,
  colors: string[],
  uses: EffectMeta['uses'],
  speed = 40,
  size = 50,
): EffectMeta => ({
  id,
  name,
  blurb,
  colorSlots: colors.length,
  uses,
  defaults: { id, colors, speed, size, direction: 'right' },
});

export const EFFECTS: EffectMeta[] = [
  fx('solid', 'Solid', 'One steady color', ['#00b4ff'], { speed: false, size: false, direction: false }),
  fx('breathing', 'Breathing', 'Slow fade in and out, cycling colors', ['#7c5cff', '#00d0ff'], { speed: true, size: false, direction: false }, 35),
  fx('rainbow', 'Rainbow Wave', 'Full spectrum flowing across the case', [], { speed: true, size: true, direction: true }, 45),
  fx('spectrum', 'Spectrum Cycle', 'Everything shifts through the hues together', [], { speed: true, size: false, direction: false }, 25),
  fx('gradient', 'Gradient Drift', 'Your colors blended and drifting', ['#ff3d9a', '#7c5cff', '#00d0ff'], { speed: true, size: true, direction: true }, 30),
  fx('aurora', 'Aurora', 'Soft, organic northern-lights motion', ['#00ffa3', '#00a2ff', '#8a2be2'], { speed: true, size: true, direction: false }, 35),
  fx('ripple', 'Ripple', 'Rings expanding from the CPU', ['#00e5ff', '#001a33'], { speed: true, size: true, direction: false }, 45),
  fx('comet', 'Comet', 'A bright head with a fading tail on every fan and stick', ['#ffffff', '#1a0b3d'], { speed: true, size: true, direction: false }, 55),
  fx('ember', 'Ember', 'Warm flickering firelight', ['#ff2200', '#ff8800', '#ffd36b'], { speed: true, size: true, direction: false }, 40),
];

export const EFFECT_BY_ID: Record<EffectId, EffectMeta> = Object.fromEntries(
  EFFECTS.map((e) => [e.id, e]),
) as Record<EffectId, EffectMeta>;

// ---- noise --------------------------------------------------------------

function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = smooth(x - xi), yf = smooth(y - yi), zf = smooth(z - zi);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), xf), l(c(0, 1, 0), c(1, 1, 0), xf), yf),
    l(l(c(0, 0, 1), c(1, 0, 1), xf), l(c(0, 1, 1), c(1, 1, 1), xf), yf),
    zf,
  );
}

function fbm(x: number, y: number, z: number): number {
  return noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 1.7) * 0.3 + noise3(x * 4.3, y * 4.3, z * 2.9) * 0.1;
}

// ---- renderers ----------------------------------------------------------

export type Renderer = (t: number, p: LedPoint) => RGB;

/** Map 0–100 speed to cycles per second on a gentle curve. */
const rate = (speed: number) => 0.02 + Math.pow(speed / 100, 1.6) * 1.4;

function project(p: LedPoint, dir: EffectConfig['direction']): number {
  switch (dir) {
    case 'left': return 1 - p.nx;
    case 'up': return 1 - p.ny;
    case 'down': return p.ny;
    default: return p.nx;
  }
}

export function createRenderer(cfg: EffectConfig): Renderer {
  const meta = EFFECT_BY_ID[cfg.id] ?? EFFECT_BY_ID.solid;
  const raw = cfg.colors.length ? cfg.colors : meta.defaults.colors;
  const cols: RGB[] = raw.map(hexToRgb);
  const c0 = cols[0] ?? [255, 255, 255];
  const c1 = cols[1] ?? [0, 0, 0];
  const r = rate(cfg.speed);
  const sz = clamp01(cfg.size / 100);

  switch (meta.id) {
    case 'solid':
      return () => c0;

    case 'breathing':
      return (t) => {
        const phase = t * r * 0.6;
        const level = Math.pow((1 - Math.cos(fract(phase) * Math.PI * 2)) / 2, 1.6);
        return scale(cols[Math.floor(phase) % cols.length] ?? c0, level);
      };

    case 'rainbow': {
      const freq = 0.25 + (1 - sz) * 2.2;
      return (t, p) => hsv(project(p, cfg.direction) * freq - t * r * 0.5, 1, 1);
    }

    case 'spectrum':
      return (t) => hsv(t * r * 0.25, 1, 1);

    case 'gradient': {
      const freq = 0.3 + (1 - sz) * 1.6;
      return (t, p) => palette(cols, project(p, cfg.direction) * freq - t * r * 0.3);
    }

    case 'aurora': {
      const f = 1.2 + (1 - sz) * 4;
      return (t, p) => {
        const z = t * r * 0.5;
        const n = fbm(p.nx * f, p.ny * f * 0.75, z);
        const m = fbm(p.nx * f + 17.3, p.ny * f + 3.1, z * 1.3);
        const c = palette(cols, n * 1.4 + z * 0.15);
        return scale(c, 0.15 + 0.85 * smooth(clamp01(m * 1.6 - 0.25)));
      };
    }

    case 'ripple': {
      const freq = 1.5 + (1 - sz) * 6;
      const cx = 0.555, cy = 0.39; // CPU
      return (t, p) => {
        const dx = (p.nx - cx) * 1.333, dy = p.ny - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        const w = 0.5 + 0.5 * Math.sin((d * freq - t * r * 1.2) * Math.PI * 2);
        return mix(c1, c0, Math.pow(w, 3));
      };
    }

    case 'comet': {
      const tail = 0.08 + sz * 0.7;
      return (t, p) => {
        const head = fract(t * r * 0.6 + p.group * 0.37);
        const d = fract(head - p.lu);
        const k = d < tail ? Math.pow(1 - d / tail, 2.2) : 0;
        return mix(scale(c1, 0.6), c0, k);
      };
    }

    case 'ember': {
      const f = 2 + (1 - sz) * 10;
      const warm: RGB[] = [[0, 0, 0], ...cols];
      return (t, p) => {
        const n = fbm(p.nx * f, p.ny * f, t * r * 2.5);
        const flick = noise3(p.u * 50 + p.group * 13, 0, t * r * 9) * 0.35;
        const heat = clamp01(n * 1.25 - 0.1 + flick - 0.15);
        return palette(warm, heat, false);
      };
    }
  }
  return () => c0;
}
