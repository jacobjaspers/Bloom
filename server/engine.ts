// The render loop: every tick, evaluate the active effect for every LED, apply
// brightness, push bytes to the hardware and publish a preview frame for the UI.

import { createRenderer, type Renderer } from '../shared/effects.ts';
import { layoutScene, type ZoneLayout } from '../shared/layout.ts';
import { FRAME_MARKER, type ColorOrder, type DeviceStatus, type Scene, type ZoneInfo, type ZoneRuntime } from '../shared/types.ts';
import { reconcile, saveScene } from './config.ts';
import type { LightDevice } from './devices/device.ts';

const FPS = 30;
const IDENTIFY_MS = 2400;

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
  onFrame: ((frame: Uint8Array) => void) | null = null;

  constructor(devices: LightDevice[], scene: Scene) {
    this.devices = devices;
    this.scene = scene;
    this.globalRenderer = createRenderer(scene.effect);
  }

  async open(): Promise<void> {
    for (const d of this.devices) {
      await d.open();
      const s = d.status();
      console.log(`[lumen] ${s.name}: ${s.state} — ${s.detail}${s.hint ? `\n         ↳ ${s.hint}` : ''}`);
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
    this.scene = reconcile(scene, infos);
    this.zones = infos.map((z) => ({
      ...z,
      ledCount: z.configurable ? (this.scene.zones[z.id].ledCount ?? z.maxLeds) : z.maxLeds,
    }));
    this.layouts = layoutScene(this.zones, this.scene.zones);
    this.globalRenderer = createRenderer(this.scene.effect);
    this.zoneRenderers.clear();
    for (const z of this.zones) {
      const s = this.scene.zones[z.id];
      if (!s.synced) this.zoneRenderers.set(z.id, createRenderer(s.effect));
    }
    if (persist) saveScene(this.scene);
  }

  identify(zoneId: string): void {
    this.identifyUntil.set(zoneId, performance.now() + IDENTIFY_MS);
  }

  start(): void {
    if (this.timer) return;
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

    this.zones.forEach((z, zi) => {
      const s = scene.zones[z.id];
      const layout = this.layouts[zi];
      const out = new Uint8Array(z.ledCount * 3);
      const until = this.identifyUntil.get(z.id) ?? 0;
      const identifying = until > now;
      const k = Math.pow(master * (s.brightness / 100), 2) * (s.enabled ? 1 : 0);
      const render = this.zoneRenderers.get(z.id) ?? this.globalRenderer;

      for (let i = 0; i < z.ledCount; i++) {
        let r: number, g: number, b: number;
        if (identifying) {
          // A white chase so you can see which header/stick this zone is.
          const head = ((now / 1000) * 1.5) % 1;
          const p = layout.points[i];
          const d = (head - (p?.lu ?? 0) + 1) % 1;
          const v = d < 0.35 ? 255 * (1 - d / 0.35) : 18;
          r = g = b = v;
        } else if (k === 0) {
          r = g = b = 0;
        } else {
          const p = layout.points[i];
          const c = p ? render(t, p) : ([0, 0, 0] as const);
          r = c[0] * k;
          g = c[1] * k;
          b = c[2] * k;
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
