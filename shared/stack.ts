// Validation + migration for effect stacks and presets. Used by the server when loading
// saved scenes and by the UI when importing preset files, so bad input can't reach the
// renderer.

import { EFFECT_BY_ID, makeLayer, newKey, SPECTRUM, stops } from './effects.ts';
import type { BlendMode, ColorStop, Curve, EffectId, EffectStack, Layer, Preset } from './types.ts';

const CURVES: Curve[] = ['smooth', 'linear', 'pulse', 'hard', 'saw'];
const BLENDS: BlendMode[] = ['normal', 'add', 'screen', 'multiply'];
const MAX_LAYERS = 6;
const MAX_STOPS = 12;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, def: number, lo = 0, hi = 100) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def;
const hex = (v: unknown, def: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : def);

function palette(v: unknown, def: ColorStop[]): ColorStop[] {
  if (!Array.isArray(v)) return structuredClone(def);
  const out = v
    .filter(isObj)
    .slice(0, MAX_STOPS)
    .map((s) => ({ pos: num(s.pos, 0, 0, 1), color: hex(s.color, '#ffffff') }));
  return out.length ? out : structuredClone(def);
}

export function sanitizeLayer(v: unknown): Layer | null {
  if (!isObj(v)) return null;
  const effect = v.effect as EffectId;
  if (!EFFECT_BY_ID[effect]) return null;
  const d = makeLayer(effect);
  return {
    key: typeof v.key === 'string' && v.key.length < 64 ? v.key : newKey(),
    effect,
    enabled: v.enabled !== false,
    palette: palette(v.palette, d.palette),
    speed: num(v.speed, d.speed),
    size: num(v.size, d.size),
    angle: num(v.angle, d.angle, 0, 359),
    reverse: v.reverse === true,
    curve: CURVES.includes(v.curve as Curve) ? (v.curve as Curve) : d.curve,
    intensity: num(v.intensity, d.intensity),
    minBrightness: num(v.minBrightness, d.minBrightness),
    maxBrightness: num(v.maxBrightness, d.maxBrightness),
    hueDrift: num(v.hueDrift, d.hueDrift, 0, 180),
    spread: num(v.spread, d.spread),
    blend: BLENDS.includes(v.blend as BlendMode) ? (v.blend as BlendMode) : d.blend,
    opacity: num(v.opacity, d.opacity),
  };
}

/** Effect config from Bloom 0.1 ({ id, colors, speed, size, direction }) → one-layer stack. */
function fromLegacy(v: Obj): EffectStack | null {
  const colors = Array.isArray(v.colors) ? v.colors.filter((c): c is string => typeof c === 'string') : [];
  const angleOf: Record<string, number> = { right: 0, up: 90, left: 180, down: 270 };
  const base = { speed: num(v.speed, 40), size: num(v.size, 50), angle: angleOf[String(v.direction)] ?? 0 };
  const pal = colors.length ? stops(...colors.map((c) => hex(c, '#ffffff'))) : undefined;
  const map: Record<string, () => Layer> = {
    solid: () => makeLayer('solid', { ...base, ...(pal && { palette: pal }) }),
    breathing: () => makeLayer('breathing', { ...base, ...(pal && { palette: pal }) }),
    rainbow: () => makeLayer('wave', { ...base, palette: SPECTRUM }),
    spectrum: () => makeLayer('cycle', { ...base, palette: SPECTRUM }),
    gradient: () => makeLayer('wave', { ...base, ...(pal && { palette: pal }) }),
    aurora: () => makeLayer('aurora', { ...base, ...(pal && { palette: pal }) }),
    ripple: () => makeLayer('ripple', { ...base, ...(pal && { palette: pal }) }),
    comet: () => makeLayer('comet', { ...base, ...(pal && { palette: pal }) }),
    ember: () => makeLayer('ember', { ...base, ...(pal && { palette: [{ pos: 0, color: '#000000' }, ...pal.map((p, i) => ({ ...p, pos: (i + 1) / pal.length }))] }) }),
  };
  const make = map[String(v.id)];
  return make ? { layers: [make()] } : null;
}

export function sanitizeStack(v: unknown, fallback: () => EffectStack): EffectStack {
  if (isObj(v) && Array.isArray(v.layers)) {
    const layers = v.layers.map(sanitizeLayer).filter((l): l is Layer => !!l).slice(0, MAX_LAYERS);
    if (layers.length) return { layers };
  }
  if (isObj(v) && typeof v.id === 'string') {
    const legacy = fromLegacy(v);
    if (legacy) return legacy;
  }
  return fallback();
}

export function sanitizePresets(v: unknown): Preset[] {
  if (!Array.isArray(v)) return [];
  const out: Preset[] = [];
  for (const p of v.slice(0, 200)) {
    if (!isObj(p)) continue;
    const name = typeof p.name === 'string' ? p.name.trim().slice(0, 48) : '';
    if (!name) continue;
    const stack = sanitizeStack(p.stack, () => ({ layers: [] }));
    if (!stack.layers.length) continue;
    out.push({ id: typeof p.id === 'string' && !p.id.startsWith('builtin:') ? p.id.slice(0, 64) : `user:${newKey()}`, name, stack });
  }
  return out;
}

export { MAX_LAYERS, MAX_STOPS };
