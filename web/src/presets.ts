import type { EffectConfig } from '../../shared/types.ts';

export interface Preset {
  name: string;
  effect: EffectConfig;
  /** CSS gradient for the chip. */
  swatch: string;
}

const p = (name: string, effect: EffectConfig): Preset => ({
  name,
  effect,
  swatch:
    effect.colors.length > 1
      ? `linear-gradient(135deg, ${effect.colors.join(', ')})`
      : effect.colors.length === 1
        ? effect.colors[0]
        : 'linear-gradient(135deg, #ff004c, #ffd000, #00ff6a, #00b7ff, #b400ff)',
});

export const PRESETS: Preset[] = [
  p('Glacier', { id: 'aurora', colors: ['#bff6ff', '#00b7ff', '#2b4cff'], speed: 25, size: 55, direction: 'right' }),
  p('Synthwave', { id: 'gradient', colors: ['#ff2fb3', '#7c3aed', '#00e5ff'], speed: 30, size: 45, direction: 'up' }),
  p('Northern', { id: 'aurora', colors: ['#00ffa3', '#00a2ff', '#8a2be2'], speed: 35, size: 50, direction: 'right' }),
  p('Prism', { id: 'rainbow', colors: [], speed: 40, size: 55, direction: 'right' }),
  p('Campfire', { id: 'ember', colors: ['#ff2200', '#ff8800', '#ffd36b'], speed: 40, size: 50, direction: 'right' }),
  p('Matrix', { id: 'comet', colors: ['#7dff8a', '#00240a'], speed: 50, size: 55, direction: 'right' }),
  p('Pulse', { id: 'ripple', colors: ['#ff3d9a', '#14001f'], speed: 45, size: 40, direction: 'right' }),
  p('Daylight', { id: 'solid', colors: ['#fff1dc'], speed: 0, size: 50, direction: 'right' }),
];
