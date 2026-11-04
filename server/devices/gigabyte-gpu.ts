// Gigabyte "RGB Fusion 2" GPU lighting (e.g. the GIGABYTE logo on the RTX 3060 Gaming OC),
// reached over the graphics card's own I2C bus via NvAPI.
//
// Protocol (8-byte raw I2C writes, no register byte):
//   AB 00 …            handshake; reading 4 bytes back returns AB 1x …
//   88 mode spd bri 08 zone 00 00   set a zone's mode (01 = static, brightness 0x63 = max)
//   40 R G B zone 00 00 00          set a static zone's color (zones 1–4)
// Only cards we've positively identified are touched, and only at their known address.

import type { DeviceStatus, ZoneInfo } from '../../shared/types.ts';
import { listNvidiaGpus, NvApiError, NvI2c, type NvGpu } from '../i2c/nvapi.ts';
import { errorMessage, type LightDevice } from './device.ts';

interface KnownCard {
  device: number[];
  subDevice: number;
  address: number;
  name: string;
  zones: number;
}

const GIGABYTE = 0x1458;
const NVIDIA = 0x10de;
const KNOWN: KnownCard[] = [
  // RTX 3060 Gaming OC 12G (LHR GA106 0x2504, GA106 0x2503, GA104 0x2487)
  { device: [0x2504, 0x2503, 0x2487], subDevice: 0x4074, address: 0x32, name: 'GIGABYTE RTX 3060 Gaming OC', zones: 4 },
];

const MODE_STATIC = 0x01;
const HANDSHAKE_OK = [0x10, 0x11, 0x12, 0x14];
const MIN_INTERVAL_MS = 50; // ~20 fps is plenty for a logo and keeps the GPU bus quiet

export class GigabyteGpu implements LightDevice {
  readonly id = 'gpu';
  name = 'Graphics card';
  private bus: NvI2c | null = null;
  private card: KnownCard | null = null;
  private last = '';
  private lastWrite = 0;
  private failures = 0;
  private state: DeviceStatus = { id: this.id, name: this.name, state: 'unavailable', detail: 'Not opened yet' };

  status(): DeviceStatus {
    return { ...this.state, name: this.name };
  }

  async open(): Promise<void> {
    try {
      const gpus = listNvidiaGpus();
      let match: { gpu: NvGpu; card: KnownCard } | null = null;
      for (const gpu of gpus) {
        if (gpu.vendor !== NVIDIA || gpu.subVendor !== GIGABYTE) continue;
        const card = KNOWN.find((k) => k.subDevice === gpu.subDevice && k.device.includes(gpu.device));
        if (card) match = { gpu, card };
      }
      if (!match) {
        const seen = gpus.map((g) => `${g.name} (${hex(g.subVendor)}:${hex(g.subDevice)})`).join(', ') || 'none';
        this.state = { id: this.id, name: this.name, state: 'unavailable', detail: `No supported Gigabyte GPU found · NVIDIA GPUs: ${seen}` };
        return;
      }
      const { gpu, card } = match;
      this.name = card.name;
      this.card = card;
      this.bus = new NvI2c(gpu, [card.address]);

      if (!this.handshake()) {
        this.state = {
          id: this.id,
          name: this.name,
          state: 'error',
          detail: `RGB controller didn't answer at 0x${hex(card.address)}`,
          hint: 'Close RGB Fusion / GIGABYTE Control Center if they are running, then restart Lumen.',
        };
        this.close();
        return;
      }
      for (let zone = 0; zone < 8; zone++) this.send([0x88, MODE_STATIC, 0x06, 0x63, 0x08, zone]);
      this.state = { id: this.id, name: this.name, state: 'connected', detail: `RGB Fusion 2 · I2C 0x${hex(card.address)} via NvAPI` };
    } catch (err) {
      this.close();
      const e = err as NvApiError;
      this.state = {
        id: this.id,
        name: this.name,
        state: e?.code === 'no-driver' ? 'unavailable' : 'error',
        detail: errorMessage(err),
      };
    }
  }

  private send(packet: number[]): number {
    const p = new Array<number>(8).fill(0);
    for (let i = 0; i < packet.length && i < 8; i++) p[i] = packet[i] & 0xff;
    return this.bus!.writeRaw(this.card!.address, p);
  }

  private handshake(): boolean {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (this.send([0xab]) !== 0) continue;
      const { status, data } = this.bus!.readRaw(this.card!.address, 4);
      if (status === 0 && data[0] === 0xab && HANDSHAKE_OK.includes(data[1])) return true;
    }
    return false;
  }

  zones(): ZoneInfo[] {
    if (!this.card) return [];
    return [{ id: 'gpu:logo', deviceId: this.id, kind: 'gpu', name: 'GPU Logo', maxLeds: this.card.zones, configurable: false }];
  }

  write(frame: Map<string, Uint8Array>): void {
    if (!this.bus || !this.card || this.state.state !== 'connected') return;
    const src = frame.get('gpu:logo');
    if (!src) return;
    const now = performance.now();
    const key = src.join(',');
    if (key === this.last || now - this.lastWrite < MIN_INTERVAL_MS) return;
    let ok = true;
    for (let z = 0; z < this.card.zones; z++) {
      const zone = z + 1;
      // Mirrors the sequence proven on this card: re-assert static mode, then the color.
      ok = this.send([0x88, MODE_STATIC, 0x06, 0x63, 0x08, zone + 1]) === 0 && ok;
      ok = this.send([0x40, src[z * 3] ?? 0, src[z * 3 + 1] ?? 0, src[z * 3 + 2] ?? 0, zone]) === 0 && ok;
    }
    this.lastWrite = now;
    if (ok) {
      this.last = key;
      this.failures = 0;
    } else if (++this.failures > 20) {
      this.state = { ...this.state, state: 'error', detail: 'GPU I2C writes keep failing' };
    }
  }

  close(): void {
    this.bus?.close();
    this.bus = null;
  }
}

function hex(n: number): string {
  return n.toString(16).padStart(2, '0');
}
