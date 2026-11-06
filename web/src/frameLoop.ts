// One shared requestAnimationFrame loop for every canvas on the page.

type Fn = (now: number) => void;
const subs = new Set<Fn>();
let raf = 0;

const reported = new WeakSet<Fn>();

function loop(now: number) {
  // Schedule the next frame first: one canvas throwing must never freeze every other one.
  raf = subs.size ? requestAnimationFrame(loop) : 0;
  for (const f of subs) {
    try {
      f(now);
    } catch (err) {
      if (!reported.has(f)) {
        reported.add(f);
        console.error('[bloom] a canvas failed to draw a frame:', err);
      }
    }
  }
}

export function subscribeFrame(fn: Fn): () => void {
  subs.add(fn);
  if (!raf) raf = requestAnimationFrame(loop);
  return () => {
    subs.delete(fn);
  };
}

/** Size a canvas to its CSS box at device pixel ratio; returns the 2D context. */
export function fitCanvas(c: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(c.clientWidth * dpr);
  const h = Math.round(c.clientHeight * dpr);
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const ctx = c.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
