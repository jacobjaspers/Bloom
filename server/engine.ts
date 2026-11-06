// The render loop: every tick, evaluate the active effect for every LED, apply
// brightness, push bytes to the hardware and publish a preview frame for the UI.

import { createRenderer, type Renderer } from '../shared/effects.ts';
import { cpuOrigin, layoutScene, type ZoneLayout } from '../shared/layout.ts';
import { FRAME_MARKER, type ColorOrder, type DeviceStatus, type Scene, type ZoneInfo, type ZoneRuntime } from '../shared/types.ts';
import { reconcile, saveScene } from './config.ts';
import type { LightDevice } from './devices/device.ts';

const FPS = 30;
const IDENTIFY_MS = 2400;
/** Brightness changes (power, sliders, zone on/off) ease instead of snapping. */
const FADE = 0.22;
/** Switching presets sweeps the new look across the case. */
const SWEEP_MS = 1100;
/** At startup, zones light up one after another. */
const INTRO_STAGGER = 0.24;
const INTRO_ZONE = 0.75;
const KIND_ORDER = { fans: 0, ram: 1, gpu: 2, accent: 3 } as const;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const ORDER: Record<ColorOrder, [number, number, number]> = {
  RGB: [0, 1, 2],
  RBG: [0, 2, 1],
  GRB: [1, 0, 2],
  GBR: [1, 2, 0],
  BRG: [2, 0, 1],
  BGR: [2, 1, 0],
};

export class Engine {
  readonly devices: LightDevice[];
  scene: Scene;
  zones: ZoneRuntime[] = [];
  private layouts: ZoneLayout[] = [];
  private globalRenderer: Renderer;
  private zoneRenderers = new Map<string, Renderer>();
  private identifyUntil = new Map<string, number>();
  private readonly t0 = performance.now();
  private timer: NodeJS.Timeout | null = null;
  private level = new Map<string, number>();
  private sweep: { from: Renderer; start: number } | null = null;
  private introStart = 0;
  private introOrder = new Map<string, number>();
  onFrame: ((frame: Uint8Array) => void) | null = null;

  constructor(devices: LightDevice[], scene: Scene) {
    this.devices = devices;
    this.scene = scene;
    this.globalRenderer = createRenderer({ layers: [] }); // real one is built in setScene()
  }

  async open(): Promise<void> {
    for (const d of this.devices) {
      await d.open();
      const s = d.status();
      console.log(`[bloom] ${s.name}: ${s.state} — ${s.detail}${s.hint ? `\n         ↳ ${s.hint}` : ''}`);
    }
    this.setScene(this.scene, false);
  }

  statuses(): DeviceStatus[] {
    return this.devices.map((d) => d.status());
  }

  private zoneInfos(): ZoneInfo[] {
    return this.devices.filter((d) => d.status().state === 'connected').flatMap((d) => d.zones());
  }

  setScene(scene: Scene, persist = true): void {
    const infos = this.zoneInfos();
    const prevPreset = this.scene.activePreset;
    const prevRenderer = this.globalRenderer;
    this.scene = reconcile(scene, infos);
    if (persist && this.scene.activePreset && this.scene.activePreset !== prevPreset) {
      this.sweep = { from: prevRenderer, start: performance.now() };
    }
    this.zones = infos.map((z) => ({
      ...z,
      ledCount: z.configurable ? (this.scene.zones[z.id].ledCount ?? z.maxLeds) : z.maxLeds,
    }));
    this.layouts = layoutScene(this.zones, this.scene.zones);
    // Intro order: fans, then RAM, then GPU, then board accents.
    [...this.zones]
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
      .forEach((z, i) => this.introOrder.set(z.id, i));
    const opts = { origin: cpuOrigin(this.scene.parts) };
    this.globalRenderer = createRenderer(this.scene.effect, opts);
    this.zoneRenderers.clear();
    for (const z of this.zones) {
      const s = this.scene.zones[z.id];
      if (!s.synced) this.zoneRenderers.set(z.id, createRenderer(s.effect, opts));
    }
    if (persist) saveScene(this.scene);
  }

  identify(zoneId: string): void {
    this.identifyUntil.set(zoneId, performance.now() + IDENTIFY_MS);
  }

  start(): void {
    if (this.timer) return;
    this.introStart = performance.now();
    this.timer = setInterval(() => this.tick(), 1000 / FPS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const now = performance.now();
    const t = (now - this.t0) / 1000;
    const scene = this.scene;
    const master = scene.power ? scene.brightness / 100 : 0;

    const preview: number[] = [FRAME_MARKER];
    const hw = new Map<string, Uint8Array>();

    // Preset sweep progress: a soft wipe with a bright leading edge.
    let front = Infinity;
    let fromRender: Renderer | null = null;
    if (this.sweep) {
      const p = (now - this.sweep.start) / SWEEP_MS;
      if (p >= 1) this.sweep = null;
      else {
        front = -0.3 + p * 1.6;
        fromRender = this.sweep.from;
      }
    }
    const introT = (now - this.introStart) / 1000;

    this.zones.forEach((z, zi) => {
      const s = scene.zones[z.id];
      const layout = this.layouts[zi];
      const out = new Uint8Array(z.ledCount * 3);
      const until = this.identifyUntil.get(z.id) ?? 0;
      const identifying = until > now;
      const target = Math.pow(master * (s.brightness / 100), 2) * (s.enabled ? 1 : 0);
      let k = this.level.get(z.id) ?? target;
      k += (target - k) * FADE;
      if (Math.abs(target - k) < 0.002) k = target;
      this.level.set(z.id, k);
      const render = this.zoneRenderers.get(z.id) ?? this.globalRenderer;
      const sweeping = fromRender && !this.zoneRenderers.has(z.id);
      const introAt = (this.introOrder.get(z.id) ?? 0) * INTRO_STAGGER;

      for (let i = 0; i < z.ledCount; i++) {
        let r: number, g: number, b: number;
        const p = layout.points[i];
        if (identifying) {
          // A white chase so you can see which header/stick this zone is.
          const head = ((now / 1000) * 1.5) % 1;
          const d = (head - (p?.lu ?? 0) + 1) % 1;
          const v = d < 0.35 ? 255 * (1 - d / 0.35) : 18;
          r = g = b = v;
        } else if (k === 0 || !p) {
          r = g = b = 0;
        } else {
          let c = render(t, p, zi);
          let edge = 0;
          if (sweeping) {
            const m = smoothstep(p.nx - 0.22, p.nx, front);
            if (m < 1) {
              const o = fromRender!(t, p, zi);
              c = [o[0] + (c[0] - o[0]) * m, o[1] + (c[1] - o[1]) * m, o[2] + (c[2] - o[2]) * m];
            }
            const dx = (p.nx - front) / 0.07;
            edge = Math.exp(-dx * dx) * 150;
          }
          // Startup: each zone fades up along its LEDs, one zone after another.
          const reveal = introT < 4 ? smoothstep(0, 1, (introT - introAt - p.lu * 0.35) / (INTRO_ZONE - 0.35)) : 1;
          const flash = introT < 4 ? Math.max(0, 1 - Math.abs(introT - introAt - p.lu * 0.35 - 0.2) / 0.2) * 120 : 0;
          r = (c[0] * reveal + edge + flash) * k;
          g = (c[1] * reveal + edge + flash) * k;
          b = (c[2] * reveal + edge + flash) * k;
        }
        // Uint8Array wraps rather than clamps, so clamp explicitly.
        out[i * 3] = r > 255 ? 255 : r;
        out[i * 3 + 1] = g > 255 ? 255 : g;
        out[i * 3 + 2] = b > 255 ? 255 : b;
      }
      for (const v of out) preview.push(v);

      const order = ORDER[s.colorOrder] ?? ORDER.RGB;
      if (order === ORDER.RGB) {
        hw.set(z.id, out);
      } else {
        const re = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i += 3) {
          re[i] = out[i + order[0]];
          re[i + 1] = out[i + order[1]];
          re[i + 2] = out[i + order[2]];
        }
        hw.set(z.id, re);
      }
    });

    for (const d of this.devices) {
      if (d.status().state === 'connected') d.write(hw);
    }
    this.onFrame?.(Uint8Array.from(preview));
  }

  shutdown(): void {
    this.stop();
    for (const d of this.devices) d.close();
  }
}
