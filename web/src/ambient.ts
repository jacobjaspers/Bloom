// Ambient glow: tints the app's background and panel edges with the live colors of the
// lights, like a TV's ambient backlight on the wall behind it. Three colors are taken
// from different parts of the rig so the glow has some variation across the window.

import { useEffect, useState } from 'react';
import type { ZoneRuntime } from '../../shared/types.ts';
import { subscribeFrame } from './frameLoop.ts';
import type { FrameStore } from './useLumen.ts';

const KEY = 'lumen.ambient';
const FALLBACK: [number, number, number][] = [
  [0, 216, 255],
  [139, 123, 255],
  [255, 79, 163],
];

export function useAmbientSetting(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== '0';
    } catch {
      return true;
    }
  });
  return [
    on,
    (v) => {
      setOn(v);
      try {
        localStorage.setItem(KEY, v ? '1' : '0');
      } catch {
        /* per-visit only */
      }
    },
  ];
}

function average(frames: Map<string, Uint8Array>, ids: string[]): [number, number, number] | null {
  let r = 0, g = 0, b = 0, n = 0;
  for (const id of ids) {
    const px = frames.get(id);
    if (!px) continue;
    for (let i = 0; i < px.length; i += 3) {
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      n++;
    }
  }
  if (!n) return null;
  return [r / n, g / n, b / n];
}

/** Normalise to full brightness (keep hue/saturation), but fade toward dark when the lights are off. */
function vivid(c: [number, number, number] | null): [number, number, number] {
  if (!c) return [0, 0, 0];
  const m = Math.max(c[0], c[1], c[2]);
  if (m < 4) return [0, 0, 0];
  const lift = 255 / m;
  const level = Math.min(1, m / 60); // very dim lights → dim glow
  return [c[0] * lift * level, c[1] * lift * level, c[2] * lift * level];
}

export function useAmbientGlow(frames: FrameStore, zones: ZoneRuntime[], enabled: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('ambient-on', enabled);
    if (!enabled) {
      FALLBACK.forEach((c, i) => root.style.setProperty(`--amb-${i}`, c.join(' ')));
      return;
    }
    const fans = zones.filter((z) => z.kind === 'fans').map((z) => z.id);
    const groups = [
      fans.slice(0, 1),
      zones.filter((z) => z.kind === 'ram' || z.kind === 'gpu').map((z) => z.id),
      [...fans.slice(1), ...zones.filter((z) => z.kind === 'accent').map((z) => z.id)],
    ];
    const all = zones.map((z) => z.id);
    const cur = FALLBACK.map((c) => [...c] as [number, number, number]);
    let tick = 0;
    return subscribeFrame(() => {
      if (tick++ % 2) return;
      groups.forEach((ids, i) => {
        const target = vivid(average(frames.current, ids.length ? ids : all));
        for (let c = 0; c < 3; c++) cur[i][c] += (target[c] - cur[i][c]) * 0.08;
        root.style.setProperty(`--amb-${i}`, cur[i].map((v) => Math.round(v)).join(' '));
      });
    });
  }, [frames, zones, enabled]);
}
