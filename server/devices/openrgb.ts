// Every RGB device OpenRGB knows about, as Bloom zones. Bloom's own drivers (ASRock,
// ENE RAM, Gigabyte GPU) take priority: OpenRGB's detectors for those are switched off,
// and any matching OpenRGB device is skipped as a second safeguard.

import type { DeviceStatus, ZoneInfo, ZoneKind } from '../../shared/types.ts';
import { OpenRgbClient, ZONE_MATRIX, type DeviceType, type OrgbController } from '../openrgb/client.ts';
import { ensureOpenRgb, type OpenRgbSource } from '../openrgb/process.ts';
import { errorMessage, type LightDevice } from './device.ts';

const PORT = Number(process.env.BLOOM_OPENRGB_PORT ?? 6742);
const MIN_INTERVAL_MS = 30;

/** OpenRGB detector names for the hardware each Bloom native driver handles. */
const DETECTORS_FOR_NATIVE: Record<string, string[]> = {
  asrock: ['ASRock Polychrome USB'],
  ram: ['ENE SMBus DRAM'],
  gpu: ['Gigabyte GeForce RTX 3060 Gaming OC', 'Gigabyte GeForce RTX 3060 Gaming OC V2'],
};

const KIND: Partial<Record<DeviceType, ZoneKind>> = {
  motherboard: 'accent',
  dram: 'ram',
  gpu: 'gpu',
  cooler: 'fans',
  case: 'fans',
  ledstrip: 'accent',
  light: 'accent',
};

/** Short, stable id for a device across restarts (OpenRGB indexes can change). */
function deviceKey(c: OrgbController): string {
  let h = 2166136261;
  for (const ch of `${c.name}|${c.location}|${c.serial}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}

interface Mapped {
  ctrl: OrgbController;
  key: string;
  /** Bloom zone id per OpenRGB zone, with where its LEDs start in the device. */
  zones: { id: string; offset: number; count: number }[];
  last: string;
  lastWrite: number;
}

export class OpenRgbDevices implements LightDevice {
  readonly id = 'openrgb';
  readonly name = 'OpenRGB devices';
  /** Set by the engine; called when devices appear or disappear. */
  onChange: (() => void) | null = null;
  private client: OpenRgbClient | null = null;
  private source: OpenRgbSource | null = null;
  private devices: Mapped[] = [];
  private skipped = 0;
  private closed = false;
  private state: DeviceStatus = { id: this.id, name: this.name, state: 'unavailable', detail: 'Starting OpenRGB…' };
  private readonly nativeConnected: () => Set<string>;

  /** `nativeConnected` reports which of Bloom's own drivers are running (asrock, ram, gpu). */
  constructor(nativeConnected: () => Set<string>) {
    this.nativeConnected = nativeConnected;
  }

  status(): DeviceStatus {
    return { ...this.state };
  }

  async open(): Promise<void> {
    const native = this.nativeConnected();
    const disabled = [...native].flatMap((n) => DETECTORS_FOR_NATIVE[n] ?? []);
    try {
      this.source = await ensureOpenRgb(PORT, disabled);
    } catch (err) {
      this.state = { id: this.id, name: this.name, state: 'error', detail: errorMessage(err) };
      return;
    }
    if (this.source.kind === 'missing') {
      this.state = {
        id: this.id,
        name: this.name,
        state: 'unavailable',
        detail: 'OpenRGB is not included in this copy of Bloom',
        hint: 'Run scripts\\fetch-openrgb.ps1 to add support for more devices.',
      };
      return;
    }
    // OpenRGB takes a few seconds to scan for hardware; connect in the background.
    void this.connectLoop();
  }

  private async connectLoop(): Promise<void> {
    for (let attempt = 0; !this.closed; attempt++) {
      const c = new OpenRgbClient();
      try {
        await c.connect(PORT);
        this.client = c;
        c.on('devicesChanged', () => void this.refresh());
        c.on('close', () => {
          if (this.closed) return;
          this.client = null;
          this.devices = [];
          this.state = { id: this.id, name: this.name, state: 'error', detail: 'Lost the connection to OpenRGB' };
          this.onChange?.();
        });
        await this.refresh();
        return;
      } catch {
        c.close();
        if (attempt > 60) {
          this.state = { id: this.id, name: this.name, state: 'error', detail: 'OpenRGB did not start' };
          this.onChange?.();
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private skip(c: OrgbController, native: Set<string>): boolean {
    const who = `${c.vendor} ${c.name}`;
    if (native.has('asrock') && c.type === 'motherboard' && /asrock/i.test(who)) return true;
    if (native.has('ram') && c.type === 'dram') return true;
    if (native.has('gpu') && c.type === 'gpu' && /gigabyte/i.test(who)) return true;
    return false;
  }

  private async refresh(): Promise<void> {
    const c = this.client;
    if (!c) return;
    try {
      const list = await c.controllers();
      const native = this.nativeConnected();
      this.skipped = 0;
      this.devices = [];
      for (const ctrl of list) {
        if (this.skip(ctrl, native)) {
          this.skipped++;
          continue;
        }
        const key = deviceKey(ctrl);
        let offset = 0;
        const zones = ctrl.zones.map((z, zi) => {
          const m = { id: `orgb:${key}:${zi}`, offset, count: z.ledsCount };
          offset += z.ledsCount;
          return m;
        });
        if (offset === 0) continue; // nothing addressable
        c.setCustomMode(ctrl.index);
        this.devices.push({ ctrl, key, zones, last: '', lastWrite: 0 });
      }
      const n = this.devices.length;
      this.state = {
        id: this.id,
        name: this.name,
        state: 'connected',
        detail:
          `${n} device${n === 1 ? '' : 's'} via OpenRGB` +
          (this.skipped ? ` · ${this.skipped} handled by Bloom directly` : '') +
          (this.source?.kind === 'external' ? ' (your OpenRGB)' : ''),
      };
    } catch (err) {
      this.state = { id: this.id, name: this.name, state: 'error', detail: `OpenRGB: ${errorMessage(err)}` };
    }
    this.onChange?.();
  }

  zones(): ZoneInfo[] {
    const out: ZoneInfo[] = [];
    // Identical devices (e.g. two RAM sticks) get numbered so they can be told apart.
    const seen = new Map<string, number>();
    const totals = new Map<string, number>();
    for (const d of this.devices) totals.set(d.ctrl.name, (totals.get(d.ctrl.name) ?? 0) + 1);
    for (const d of this.devices) {
      const n = (seen.get(d.ctrl.name) ?? 0) + 1;
      seen.set(d.ctrl.name, n);
      const devName = (totals.get(d.ctrl.name) ?? 1) > 1 ? `${d.ctrl.name} ${n}` : d.ctrl.name;
      const baseKind: ZoneKind = KIND[d.ctrl.type] ?? 'device';
      d.ctrl.zones.forEach((z, zi) => {
        if (!z.ledsCount) return;
        const single = d.ctrl.zones.filter((x) => x.ledsCount).length === 1;
        // A motherboard's addressable headers almost always drive fans.
        const kind: ZoneKind =
          baseKind === 'accent' && d.ctrl.type === 'motherboard' && z.ledsCount > 1 && /addressable|argb|fan/i.test(z.name)
            ? 'fans'
            : baseKind;
        const info: ZoneInfo = {
          id: d.zones[zi].id,
          deviceId: this.id,
          kind,
          name: single ? devName : `${devName} · ${z.name}`,
          maxLeds: z.ledsCount,
          configurable: false,
          via: 'OpenRGB',
        };
        if (z.type === ZONE_MATRIX && z.matrix && z.matrix.width > 1) info.grid = z.matrix;
        out.push(info);
      });
    }
    return out;
  }

  write(frame: Map<string, Uint8Array>): void {
    const c = this.client;
    if (!c?.connected) return;
    const now = performance.now();
    for (const d of this.devices) {
      if (now - d.lastWrite < MIN_INTERVAL_MS) continue;
      const total = d.zones.reduce((n, z) => n + z.count, 0);
      const rgb = new Uint8Array(total * 3);
      for (const z of d.zones) {
        const src = frame.get(z.id);
        if (src) rgb.set(src.subarray(0, z.count * 3), z.offset * 3);
      }
      const key = rgb.join(',');
      if (key === d.last) continue;
      try {
        c.updateLeds(d.ctrl.index, rgb, total);
        d.last = key;
        d.lastWrite = now;
      } catch {
        /* connection dropping; the close handler resets state */
      }
    }
  }

  close(): void {
    this.closed = true;
    this.client?.close();
    this.client = null;
    if (this.source?.kind === 'bundled') {
      try {
        this.source.proc.kill();
      } catch {
        /* already gone */
      }
    }
  }
}
