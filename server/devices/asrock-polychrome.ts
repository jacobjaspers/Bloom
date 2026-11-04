// ASRock Polychrome RGB (USB HID, VID 0x26CE / PID 0x01A2) — found on ASRock
// Intel 400/500-series and AMD 500-series boards (e.g. B560M-C).
//
// Protocol notes (64-byte reports, report ID 0):
//   0x14 0x00 <id>            read config. id=1 → byte[4] is a zone-enable bitmask,
//                                          id=2 → bytes[4..11] are per-zone LED counts.
//   0x10 0x00 0xFF 0xE3 ...   first per-LED packet (54 bytes of colors)
//   0x10 0x00 0xFF 0xE4 ...   15 continuation packets (57 bytes each)
// Zone order in the per-LED stream: 12V RGB headers (3 bytes each), ARGB 1 (80 LEDs),
// ARGB 2 (80 LEDs), PCH, IO shield, PCB, ARGB 3. A count of 30 means "not present".
// ARGB headers are only addressable per-LED when Polychrome has them set to 80 LEDs.

import HID from 'node-hid';
import type { DeviceStatus, ZoneInfo } from '../../shared/types.ts';
import { errorMessage, type LightDevice } from './device.ts';

const VID = 0x26ce;
const PID = 0x01a2;
const REPORT = 65; // report ID + 64 bytes
const ARGB_MAX = 80;
const ZONE_KEYS = ['rgb1', 'rgb2', 'argb1', 'argb2', 'pch', 'io', 'pcb', 'argb3'] as const;
type ZoneKey = (typeof ZONE_KEYS)[number];

interface BoardConfig {
  counts: Record<ZoneKey, number>;
  enabledMask: number;
}

export class AsrockPolychrome implements LightDevice {
  readonly id = 'asrock';
  name = 'ASRock Polychrome';
  private hid: HID.HID | null = null;
  private cfg: BoardConfig | null = null;
  private state: DeviceStatus = {
    id: this.id,
    name: this.name,
    state: 'unavailable',
    detail: 'Not opened yet',
  };
  private failures = 0;

  status(): DeviceStatus {
    return { ...this.state, name: this.name };
  }

  async open(): Promise<void> {
    const info = HID.devices().find((d) => d.vendorId === VID && d.productId === PID && (d.interface ?? 0) <= 0);
    if (!info?.path) {
      this.state = { id: this.id, name: this.name, state: 'unavailable', detail: 'ASRock LED controller not found on USB' };
      return;
    }
    try {
      this.hid = new HID.HID(info.path);
      this.cfg = this.readBoardConfig();
      const on = ZONE_KEYS.filter((k) => this.present(k)).map((k) => `${k}:${this.cfg!.counts[k]}`);
      this.state = {
        id: this.id,
        name: this.name,
        state: 'connected',
        detail: `Per-LED mode · zones ${on.join(', ')}`,
      };
    } catch (err) {
      this.hid?.close();
      this.hid = null;
      this.state = {
        id: this.id,
        name: this.name,
        state: 'error',
        detail: errorMessage(err),
        hint: 'Another app (SignalRGB, Polychrome Sync, OpenRGB) may be holding the controller. Quit it and restart Lumen.',
      };
    }
  }

  private send(bytes: number[]): void {
    const buf = new Array<number>(REPORT).fill(0);
    for (let i = 0; i < bytes.length && i < REPORT; i++) buf[i] = bytes[i];
    this.hid!.write(buf);
  }

  private readConfig(id: number): number[] {
    const hid = this.hid!;
    // The controller answers each request with one real report followed by a few
    // zero-filled echoes, so drain thoroughly and take the first report that echoes our id.
    while (hid.readTimeout(30).length) { /* drain */ }
    this.send([0x00, 0x14, 0x00, id]);
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = hid.readTimeout(200);
      if (!res.length) break;
      // Windows strips report ID 0; byte 3 echoes the config id.
      if (res[3] === id) {
        while (hid.readTimeout(30).length) { /* drop trailing echoes */ }
        return res;
      }
    }
    throw new Error(`No response to config read ${id}`);
  }

  private readBoardConfig(): BoardConfig {
    const countsRaw = this.readConfig(2).slice(4, 12);
    const mask = this.readConfig(1)[4] ?? 0xff;
    const counts = {} as Record<ZoneKey, number>;
    ZONE_KEYS.forEach((k, i) => (counts[k] = countsRaw[i] ?? 0));
    return { counts, enabledMask: mask };
  }

  private present(k: ZoneKey): boolean {
    if (!this.cfg) return false;
    const i = ZONE_KEYS.indexOf(k);
    const enabled = ((this.cfg.enabledMask >> i) & 1) === 1;
    const n = this.cfg.counts[k];
    if (!enabled || n === 0 || n === 30) return false;
    if (k.startsWith('argb')) return n === ARGB_MAX;
    return true;
  }

  zones(): ZoneInfo[] {
    if (!this.cfg) return [];
    const z: ZoneInfo[] = [];
    const add = (key: ZoneKey, kind: ZoneInfo['kind'], name: string, max: number, configurable: boolean) => {
      if (this.present(key)) z.push({ id: `asrock:${key}`, deviceId: this.id, kind, name, maxLeds: max, configurable });
    };
    add('argb1', 'fans', 'ARGB Header 1', ARGB_MAX, true);
    add('argb2', 'fans', 'ARGB Header 2', ARGB_MAX, true);
    add('argb3', 'fans', 'ARGB Header 3', ARGB_MAX, true);
    add('pcb', 'accent', 'Board Accent', this.cfg.counts.pcb, false);
    add('pch', 'accent', 'Chipset Cover', this.cfg.counts.pch, false);
    add('io', 'accent', 'I/O Cover', this.cfg.counts.io, false);
    add('rgb1', 'accent', '12V RGB Header 1', 1, false);
    add('rgb2', 'accent', '12V RGB Header 2', 1, false);
    return z;
  }

  write(frame: Map<string, Uint8Array>): void {
    if (!this.hid || !this.cfg) return;
    const data: number[] = [];
    const put = (key: ZoneKey, leds: number) => {
      const src = frame.get(`asrock:${key}`);
      for (let i = 0; i < leds * 3; i++) data.push(src && i < src.length ? src[i] : 0);
    };
    if (this.present('rgb1')) put('rgb1', 1);
    if (this.present('rgb2')) put('rgb2', 1);
    put('argb1', ARGB_MAX); // always occupies its slot
    put('argb2', ARGB_MAX);
    for (const k of ['pch', 'io', 'pcb'] as const) if (this.present(k)) put(k, this.cfg.counts[k]);
    if (this.present('argb3')) put('argb3', ARGB_MAX);

    try {
      this.send([0x00, 0x10, 0x00, 0xff, 0xe3, 0x00, 0x00, 0x2f, 0x01, ...data.splice(0, 54)]);
      for (let p = 0; p < 15; p++) this.send([0x00, 0x10, 0x00, 0xff, 0xe4, ...data.splice(0, 57)]);
      this.failures = 0;
    } catch (err) {
      if (++this.failures > 10) {
        this.state = { id: this.id, name: this.name, state: 'error', detail: `Write failed: ${errorMessage(err)}` };
        this.close();
      }
    }
  }

  close(): void {
    try {
      this.hid?.close();
    } catch { /* ignore */ }
    this.hid = null;
  }
}
