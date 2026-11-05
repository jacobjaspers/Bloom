// Effect library and layer compositor.
//
// Every effect is a *field*: for an LED at a position and time it returns
//   v — where to sample the layer's color gradient (0..1)
//   a — how lit the LED is (0..1)
// The shared pipeline then applies intensity, brightness range, hue drift and blending,
// so every control works the same way on every effect. The same code drives the hardware
// (server) and every preview in the UI.

import { clamp01, fract, hexToRgb, smooth } from './color.ts';
import type { LedPoint } from './layout.ts';
import type { BlendMode, ColorStop, Curve, EffectId, EffectStack, Layer, RGB } from './types.ts';

// ---- metadata ---------------------------------------------------------------

export interface EffectUses {
  speed: boolean;
  size: boolean;
  angle: boolean;
  curve: boolean;
  intensity: boolean;
  spread: boolean;
}

export interface EffectMeta {
  id: EffectId;
  name: string;
  blurb: string;
  uses: EffectUses;
  sizeLabel?: string;
  curveLabel?: string;
  defaults: Partial<Layer> & { palette: ColorStop[] };
}

export const SPECTRUM: ColorStop[] = ['#ff0040', '#ff9900', '#ffee00', '#00ff6a', '#00b7ff', '#6a3dff', '#ff00d4'].map(
  (color, i, a) => ({ pos: i / a.length, color }),
);

export function stops(...colors: string[]): ColorStop[] {
  return colors.map((color, i) => ({ pos: colors.length === 1 ? 0 : i / (colors.length - 1), color }));
}

const U = (u: Partial<EffectUses>): EffectUses => ({
  speed: false,
  size: false,
  angle: false,
  curve: false,
  intensity: false,
  spread: false,
  ...u,
});

export const EFFECTS: EffectMeta[] = [
  {
    id: 'solid',
    name: 'Static',
    blurb: 'One steady color.',
    uses: U({}),
    defaults: { palette: stops('#00b4ff') },
  },
  {
    id: 'gradient',
    name: 'Gradient',
    blurb: 'Your gradient laid across the whole case, holding still.',
    uses: U({ angle: true, size: true }),
    sizeLabel: 'Stretch',
    defaults: { palette: stops('#ff3d9a', '#7c5cff', '#00d0ff'), size: 50 },
  },
  {
    id: 'breathing',
    name: 'Breathe',
    blurb: 'Fades in and out, moving to the next color stop each breath.',
    uses: U({ speed: true, curve: true, intensity: true, spread: true }),
    curveLabel: 'Breath shape',
    defaults: { palette: stops('#7c5cff', '#00d0ff'), speed: 35 },
  },
  {
    id: 'wave',
    name: 'Color Wave',
    blurb: 'Your gradient flowing across the case.',
    uses: U({ speed: true, size: true, angle: true, curve: true, spread: true }),
    sizeLabel: 'Wave length',
    curveLabel: 'Transitions',
    defaults: { palette: SPECTRUM, speed: 45, size: 50 },
  },
  {
    id: 'cycle',
    name: 'Color Cycle',
    blurb: 'Everything shifts through your gradient together.',
    uses: U({ speed: true, curve: true, spread: true }),
    curveLabel: 'Transitions',
    defaults: { palette: SPECTRUM, speed: 25 },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    blurb: 'Soft, organic northern-lights motion.',
    uses: U({ speed: true, size: true, intensity: true, spread: true }),
    sizeLabel: 'Cloud size',
    defaults: { palette: stops('#00ffa3', '#00a2ff', '#8a2be2'), speed: 35, size: 50, intensity: 85 },
  },
  {
    id: 'ripple',
    name: 'Ripple',
    blurb: 'Rings of color radiating out from the CPU.',
    uses: U({ speed: true, size: true, curve: true, intensity: true }),
    sizeLabel: 'Ring spacing',
    curveLabel: 'Ring shape',
    defaults: { palette: stops('#00e5ff', '#7c5cff'), speed: 45, size: 40, curve: 'pulse', intensity: 100 },
  },
  {
    id: 'comet',
    name: 'Comet',
    blurb: 'A bright head with a fading tail around every fan and stick.',
    uses: U({ speed: true, size: true, intensity: true, spread: true }),
    sizeLabel: 'Tail length',
    defaults: { palette: stops('#ffffff', '#7c5cff'), speed: 55, size: 50, intensity: 92 },
  },
  {
    id: 'twinkle',
    name: 'Starfield',
    blurb: 'Random LEDs sparkle with colors from your gradient.',
    uses: U({ speed: true, size: true, curve: true, intensity: true }),
    sizeLabel: 'Density',
    curveLabel: 'Sparkle shape',
    defaults: { palette: stops('#ffffff', '#9ad8ff', '#ffd6a0'), speed: 40, size: 45, curve: 'pulse', intensity: 100 },
  },
  {
    id: 'ember',
    name: 'Fire',
    blurb: 'Warm, flickering firelight. The gradient runs from coals to flame.',
    uses: U({ speed: true, size: true, intensity: true }),
    sizeLabel: 'Flame size',
    defaults: { palette: stops('#5a0500', '#ff3a00', '#ff9a00', '#ffe08a'), speed: 40, size: 50, intensity: 90 },
  },
];

export const EFFECT_BY_ID: Record<EffectId, EffectMeta> = Object.fromEntries(EFFECTS.map((e) => [e.id, e])) as Record<
  EffectId,
  EffectMeta
>;

export const CURVES: { value: Curve; label: string; title: string }[] = [
  { value: 'smooth', label: 'Smooth', title: 'Gentle sine-like easing' },
  { value: 'linear', label: 'Linear', title: 'Even, constant-rate change' },
  { value: 'pulse', label: 'Pulse', title: 'Short bright peaks with longer rests' },
  { value: 'hard', label: 'Hard', title: 'Instant on/off cuts' },
  { value: 'saw', label: 'Saw', title: 'Snap on, then fade out' },
];

export const BLENDS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'add', label: 'Add' },
  { value: 'screen', label: 'Screen' },
  { value: 'multiply', label: 'Multiply' },
];

let keySeq = 0;
export function newKey(): string {
  keySeq = (keySeq + 1) % 1e6;
  return `${Date.now().toString(36)}${keySeq.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** A fresh layer of the given effect with its defaults. */
export function makeLayer(effect: EffectId, overrides: Partial<Layer> = {}): Layer {
  const meta = EFFECT_BY_ID[effect] ?? EFFECT_BY_ID.solid;
  return {
    key: newKey(),
    effect: meta.id,
    enabled: true,
    speed: 40,
    size: 50,
    angle: 0,
    reverse: false,
    curve: 'smooth',
    intensity: 100,
    minBrightness: 0,
    maxBrightness: 100,
    hueDrift: 0,
    spread: 0,
    blend: 'normal',
    opacity: 100,
    ...structuredClone(meta.defaults),
    ...overrides,
  };
}

// ---- noise ------------------------------------------------------------------

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

// ---- palette lookup -----------------------------------------------------------

const LUT_N = 256;

export function sortedStops(palette: ColorStop[]): ColorStop[] {
  const s = palette.length ? [...palette] : [{ pos: 0, color: '#ffffff' }];
  return s.sort((a, b) => a.pos - b.pos).map((p) => ({ pos: clamp01(p.pos), color: p.color }));
}

/** Precompute 256 colors along the gradient. `loop` wraps the last stop back to the first. */
export function buildLut(palette: ColorStop[], loop: boolean): Float32Array {
  const s = sortedStops(palette);
  const rgb = s.map((p) => hexToRgb(p.color));
  const out = new Float32Array(LUT_N * 3);
  for (let i = 0; i < LUT_N; i++) {
    const t = i / (LUT_N - 1);
    let a = s.length - 1, b = 0, f = 0;
    if (s.length === 1) {
      a = b = 0;
    } else if (t <= s[0].pos || t >= s[s.length - 1].pos) {
      if (loop) {
        const span = 1 - s[s.length - 1].pos + s[0].pos;
        const d = t >= s[s.length - 1].pos ? t - s[s.length - 1].pos : t + 1 - s[s.length - 1].pos;
        a = s.length - 1;
        b = 0;
        f = span > 0 ? d / span : 0;
      } else {
        a = b = t <= s[0].pos ? 0 : s.length - 1;
      }
    } else {
      for (let k = 0; k < s.length - 1; k++) {
        if (t >= s[k].pos && t <= s[k + 1].pos) {
          a = k;
          b = k + 1;
          const span = s[k + 1].pos - s[k].pos;
          f = span > 0 ? (t - s[k].pos) / span : 0;
          break;
        }
      }
    }
    for (let c = 0; c < 3; c++) out[i * 3 + c] = rgb[a][c] + (rgb[b][c] - rgb[a][c]) * f;
  }
  return out;
}

/** CSS gradient for UI swatches. */
export function cssGradient(palette: ColorStop[], angle = 90): string {
  const s = sortedStops(palette);
  if (s.length === 1) return s[0].color;
  return `linear-gradient(${angle}deg, ${s.map((p) => `${p.color} ${(p.pos * 100).toFixed(1)}%`).join(', ')})`;
}

// ---- curves -----------------------------------------------------------------

/** Periodic wave shape: x in [0,1) → [0,1]. */
export function shape(curve: Curve, x: number): number {
  x = fract(x);
  switch (curve) {
    case 'linear': return 1 - Math.abs(2 * x - 1);
    case 'pulse': return Math.pow(0.5 - 0.5 * Math.cos(x * Math.PI * 2), 4);
    case 'hard': return x < 0.5 ? 1 : 0;
    case 'saw': return 1 - x;
    default: return 0.5 - 0.5 * Math.cos(x * Math.PI * 2);
  }
}

// ---- layer renderer -------------------------------------------------------------

export type Renderer = (t: number, p: LedPoint, zone: number) => RGB;

/** Map 0–100 speed to cycles per second on a gentle curve. */
export const rate = (speed: number) => 0.02 + Math.pow(speed / 100, 1.6) * 1.4;

interface Sample {
  v: number;
  a: number;
  loop: boolean;
}

type Field = (t: number, p: LedPoint, zone: number, out: Sample) => void;

/** Where Ripple radiates from (normalised scene coords); defaults to the stock CPU position. */
export interface RenderOptions {
  origin?: { nx: number; ny: number };
}

function makeField(L: Layer, nStops: number, stopPos: number[], opts: RenderOptions): Field {
  const r = rate(L.speed);
  const sz = clamp01(L.size / 100);
  const rad = (L.angle * Math.PI) / 180;
  const dx = Math.cos(rad), dy = -Math.sin(rad);
  // Signed distance along the travel direction, centred on the case, roughly 0..1.
  const project = (p: LedPoint) => (p.nx - 0.5) * 1.333 * dx + (p.ny - 0.5) * dy + 0.5;

  // Walk along the palette `x` palette-lengths; the curve picks how colors hand over.
  const traverse = (x: number, out: Sample) => {
    const f = fract(x);
    if (L.curve === 'smooth') {
      out.v = f; out.a = 1; out.loop = true;
    } else if (L.curve === 'linear') {
      out.v = 1 - Math.abs(2 * fract(x * 0.5) - 1); out.a = 1; out.loop = false; // ping-pong, no seam
    } else {
      const k = Math.min(nStops - 1, Math.floor(f * nStops));
      out.v = stopPos[k]; out.loop = false;
      out.a = L.curve === 'hard' ? 1 : shape(L.curve, fract(f * nStops) + (L.curve === 'pulse' ? 0.5 : 0));
    }
  };

  switch (L.effect) {
    case 'solid':
      return (_t, _p, _z, o) => { o.v = stopPos[0]; o.a = 1; o.loop = false; };

    case 'gradient': {
      const stretch = 0.4 + sz * 1.6;
      return (_t, p, _z, o) => {
        o.v = clamp01((project(p) - 0.5) / stretch + 0.5); o.a = 1; o.loop = false;
      };
    }

    case 'breathing':
      return (t, _p, _z, o) => {
        const phase = t * r * 0.6;
        o.v = stopPos[Math.floor(phase) % nStops] ?? 0;
        o.a = shape(L.curve, phase);
        o.loop = false;
      };

    case 'wave': {
      const freq = 0.25 + (1 - sz) * 2.2;
      return (t, p, _z, o) => traverse(project(p) * freq - t * r * 0.5, o);
    }

    case 'cycle':
      return (t, _p, _z, o) => traverse(t * r * 0.25, o);

    case 'aurora': {
      const f = 1.2 + (1 - sz) * 4;
      return (t, p, _z, o) => {
        const z = t * r * 0.5;
        const n = fbm(p.nx * f, p.ny * f * 0.75, z);
        const m = fbm(p.nx * f + 17.3, p.ny * f + 3.1, z * 1.3);
        o.v = fract(n * 1.4 + z * 0.15);
        o.a = smooth(clamp01(m * 1.6 - 0.25));
        o.loop = true;
      };
    }

    case 'ripple': {
      const freq = 1.5 + (1 - sz) * 6;
      const cx = opts.origin?.nx ?? 0.555, cy = opts.origin?.ny ?? 0.39; // the CPU
      return (t, p, _z, o) => {
        const ddx = (p.nx - cx) * 1.333, ddy = p.ny - cy;
        const x = Math.sqrt(ddx * ddx + ddy * ddy) * freq - t * r * 1.2;
        o.v = stopPos[((Math.floor(x) % nStops) + nStops) % nStops];
        o.a = shape(L.curve, x);
        o.loop = false;
      };
    }

    case 'comet': {
      const tail = 0.08 + sz * 0.7;
      return (t, p, _z, o) => {
        const head = fract(t * r * 0.6 + p.group * 0.37);
        const d = fract(head - p.lu);
        if (d < tail) {
          o.v = d / tail; o.a = Math.pow(1 - d / tail, 2.2);
        } else {
          o.v = 1; o.a = 0;
        }
        o.loop = false;
      };
    }

    case 'twinkle': {
      const density = 0.08 + sz * 0.8;
      return (t, p, zone, o) => {
        const id = zone * 977 + Math.round(p.u * 4096) + p.group * 131;
        const offset = hash3(id, 7, 3);
        const phase = t * r * 0.8 + offset;
        const cycle = Math.floor(phase);
        if (hash3(id, cycle, 11) > density) {
          o.a = 0; o.v = 0;
        } else {
          o.a = shape(L.curve, phase);
          o.v = hash3(id, cycle, 29);
        }
        o.loop = false;
      };
    }

    case 'ember': {
      const f = 2 + (1 - sz) * 10;
      return (t, p, _z, o) => {
        const n = fbm(p.nx * f, p.ny * f, t * r * 2.5);
        const flick = noise3(p.u * 50 + p.group * 13, 0, t * r * 9) * 0.35;
        const heat = clamp01(n * 1.25 - 0.25 + flick);
        o.v = heat; o.a = smooth(clamp01(heat * 1.4)); o.loop = false;
      };
    }
  }
  return (_t, _p, _z, o) => { o.v = 0; o.a = 1; o.loop = false; };
}

/** Rotate a color's hue by `deg` (YIQ rotation; fast and good enough for LEDs). */
function hueMatrix(deg: number): number[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    0.299 + 0.701 * c + 0.168 * s, 0.587 - 0.587 * c + 0.33 * s, 0.114 - 0.114 * c - 0.497 * s,
    0.299 - 0.299 * c - 0.328 * s, 0.587 + 0.413 * c + 0.035 * s, 0.114 - 0.114 * c + 0.292 * s,
    0.299 - 0.3 * c + 1.25 * s, 0.587 - 0.588 * c - 1.05 * s, 0.114 + 0.886 * c - 0.203 * s,
  ];
}

export interface LayerSample {
  r: number;
  g: number;
  b: number;
  /** 0..1 coverage, used by Normal blending on upper layers. */
  alpha: number;
}

export function createLayerRenderer(
  L: Layer,
  opts: RenderOptions = {},
): (t: number, p: LedPoint, zone: number, out: LayerSample) => void {
  const s = sortedStops(L.palette);
  const stopPos = s.map((x) => x.pos);
  const loopLut = buildLut(s, true);
  const clampLut = buildLut(s, false);
  const field = makeField(L, s.length, stopPos, opts);
  const I = clamp01(L.intensity / 100);
  const lo = clamp01(Math.min(L.minBrightness, L.maxBrightness) / 100);
  const hi = clamp01(Math.max(L.minBrightness, L.maxBrightness) / 100);
  const period = 1 / rate(L.speed);
  const spread = (L.spread / 100) * period;
  const dir = L.reverse ? -1 : 1;
  const sample: Sample = { v: 0, a: 1, loop: false };
  let lastT = NaN;
  let m: number[] | null = null;

  return (t, p, zone, out) => {
    const lt = dir * t + zone * spread;
    field(lt, p, zone, sample);
    const a = 1 - I * (1 - clamp01(sample.a));
    const level = lo + (hi - lo) * a;
    const lut = sample.loop ? loopLut : clampLut;
    const i = Math.max(0, Math.min(LUT_N - 1, Math.round((sample.loop ? fract(sample.v) : clamp01(sample.v)) * (LUT_N - 1)))) * 3;
    let r = lut[i], g = lut[i + 1], b = lut[i + 2];
    if (L.hueDrift > 0) {
      if (t !== lastT) {
        // Drift slowly back and forth; period ~24 s, independent of effect speed.
        m = hueMatrix(L.hueDrift * Math.sin((t * Math.PI * 2) / 24));
        lastT = t;
      }
      const mm = m!;
      const nr = mm[0] * r + mm[1] * g + mm[2] * b;
      const ng = mm[3] * r + mm[4] * g + mm[5] * b;
      const nb = mm[6] * r + mm[7] * g + mm[8] * b;
      r = nr < 0 ? 0 : nr; g = ng < 0 ? 0 : ng; b = nb < 0 ? 0 : nb;
    }
    out.r = r * level;
    out.g = g * level;
    out.b = b * level;
    out.alpha = hi > 0 ? level / hi : 0;
  };
}

/** Composite a whole stack: bottom layer is opaque, upper layers blend onto it. */
export function createRenderer(stack: EffectStack, opts: RenderOptions = {}): Renderer {
  const layers = stack.layers.filter((l) => l.enabled);
  const renders = layers.map((l) => createLayerRenderer(l, opts));
  const s: LayerSample = { r: 0, g: 0, b: 0, alpha: 1 };
  return (t, p, zone) => {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < renders.length; i++) {
      renders[i](t, p, zone, s);
      const L = layers[i];
      const op = clamp01(L.opacity / 100);
      if (i === 0) {
        r = s.r * op; g = s.g * op; b = s.b * op;
        continue;
      }
      switch (L.blend) {
        case 'add':
          r += s.r * op; g += s.g * op; b += s.b * op;
          break;
        case 'screen':
          r = 255 - ((255 - r) * (255 - Math.min(255, s.r * op))) / 255;
          g = 255 - ((255 - g) * (255 - Math.min(255, s.g * op))) / 255;
          b = 255 - ((255 - b) * (255 - Math.min(255, s.b * op))) / 255;
          break;
        case 'multiply': {
          r *= 1 - op + (op * s.r) / 255; g *= 1 - op + (op * s.g) / 255; b *= 1 - op + (op * s.b) / 255;
          break;
        }
        default: {
          // Normal: dark parts of an upper layer are see-through.
          const k = op * s.alpha;
          const inv = k > 0 ? 1 / Math.max(s.alpha, 1e-6) : 0;
          r += (s.r * inv - r) * k; g += (s.g * inv - g) * k; b += (s.b * inv - b) * k;
        }
      }
    }
    return [r > 255 ? 255 : r, g > 255 ? 255 : g, b > 255 ? 255 : b];
  };
}
