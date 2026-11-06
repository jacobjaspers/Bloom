// Built-in presets. They show off what the layer system can do; users can load one,
// tweak it, and save it as their own.

import { makeLayer, SPECTRUM, stops } from './effects.ts';
import type { Layer, Preset } from './types.ts';

const P = (id: string, name: string, ...layers: Layer[]): Preset => ({
  id: `builtin:${id}`,
  name,
  builtin: true,
  stack: { layers },
});

export const BUILTIN_PRESETS: Preset[] = [
  P('northern', 'Northern Lights', makeLayer('aurora', { palette: stops('#00ffa3', '#00a2ff', '#8a2be2'), speed: 30 })),
  P(
    'glacier',
    'Glacier',
    makeLayer('aurora', { palette: stops('#dff9ff', '#00b7ff', '#2b4cff'), speed: 22, size: 60, minBrightness: 18 }),
    makeLayer('twinkle', { palette: stops('#ffffff', '#c9f3ff'), size: 20, speed: 30, blend: 'screen', opacity: 70 }),
  ),
  P(
    'synthwave',
    'Synthwave',
    makeLayer('wave', { palette: stops('#ff2fb3', '#7c3aed', '#00e5ff'), speed: 30, size: 45, angle: 90, curve: 'linear' }),
  ),
  P('prism', 'Prism', makeLayer('wave', { palette: SPECTRUM, speed: 40, size: 55 })),
  P(
    'campfire',
    'Campfire',
    makeLayer('ember', { speed: 40, size: 50 }),
    makeLayer('breathing', { palette: stops('#ff5a00'), speed: 15, blend: 'add', opacity: 25, minBrightness: 0 }),
  ),
  P(
    'matrix',
    'Matrix',
    makeLayer('solid', { palette: stops('#002a0c'), maxBrightness: 60 }),
    makeLayer('comet', { palette: stops('#b6ffbf', '#00c43a'), speed: 50, size: 55, spread: 35, blend: 'screen' }),
  ),
  P(
    'heartbeat',
    'Heartbeat',
    makeLayer('breathing', { palette: stops('#ff1744'), speed: 55, curve: 'pulse', minBrightness: 6 }),
  ),
  P(
    'police',
    'Siren',
    makeLayer('cycle', { palette: stops('#ff0022', '#0033ff'), speed: 70, curve: 'hard', spread: 50 }),
  ),
  P(
    'deepspace',
    'Deep Space',
    makeLayer('gradient', { palette: stops('#090030', '#2a0a5e', '#00172e'), angle: 90 }),
    makeLayer('twinkle', { palette: stops('#ffffff', '#b8c8ff', '#ffd0f0'), size: 35, speed: 35, blend: 'add' }),
  ),
  P('daylight', 'Daylight', makeLayer('solid', { palette: stops('#fff1dc') })),
  // Easter egg: the developer's own favorite, tuned on the original rig.
  {
    ...P(
      'wonderpop',
      'Wonder Pop',
      makeLayer('ember', {
        palette: [
          { pos: 0.405, color: '#ff0040' },
          { pos: 0.518, color: '#ff9900' },
          { pos: 0.61, color: '#ffee00' },
          { pos: 0.684, color: '#00ff6a' },
          { pos: 0.759, color: '#00b7ff' },
          { pos: 0.844, color: '#6a3dff' },
          { pos: 0.922, color: '#ff00d4' },
        ],
        speed: 25,
        size: 49,
        intensity: 90,
        blend: 'screen',
      }),
    ),
    credit: 'A favorite from the developer',
  },
];
