import { useEffect, useMemo, useRef } from 'react';
import { createRenderer } from '../../../shared/effects.ts';
import type { LedPoint } from '../../../shared/layout.ts';
import type { EffectStack } from '../../../shared/types.ts';
import { fitCanvas, subscribeFrame } from '../frameLoop.ts';

const COLS = 20;
const ROWS = 8;
const GRID: LedPoint[] = [];
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const nx = (x + 0.5) / COLS;
    const ny = (y + 0.5) / ROWS;
    GRID.push({ x: nx * 100, y: ny * 75, nx, ny, u: (y * COLS + x) / (COLS * ROWS), lu: nx, group: y });
  }
}

/** Animated preview of an effect stack, rendered at grid resolution and upscaled smoothly. */
export function StackThumb({ stack, className = 'thumb' }: { stack: EffectStack; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const render = useMemo(() => createRenderer(stack), [stack]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(c);
    const small = document.createElement('canvas');
    small.width = COLS;
    small.height = ROWS;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(COLS, ROWS);
    const t0 = performance.now();
    let frame = 0;
    const unsub = subscribeFrame((now) => {
      if (!visible || frame++ % 2) return; // ~30 fps, and only while on screen
      const ctx = fitCanvas(c);
      if (!ctx) return;
      const t = (now - t0) / 1000;
      for (let i = 0; i < GRID.length; i++) {
        const [r, g, b] = render(t, GRID[i], GRID[i].group % 3);
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = 255;
      }
      sctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(small, 0, 0, c.clientWidth, c.clientHeight);
    });
    return () => {
      unsub();
      io.disconnect();
    };
  }, [render]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
