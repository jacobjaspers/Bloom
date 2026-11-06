// Minimal client for OpenRGB's SDK network protocol (default port 6742).
//
// Every packet starts with a 16-byte little-endian header:
//   char[4] "ORGB" | u32 device id | u32 packet id | u32 payload size
// We negotiate protocol version 4 (OpenRGB 0.9 format), which every current OpenRGB
// still serves and which has everything Bloom needs: device list, zones (with matrix
// maps for keyboards), per-LED colors, and switching a device to its direct mode.

import net from 'node:net';
import { EventEmitter } from 'node:events';

export const PROTOCOL = 4;

const PKT = {
  REQUEST_CONTROLLER_COUNT: 0,
  REQUEST_CONTROLLER_DATA: 1,
  REQUEST_PROTOCOL_VERSION: 40,
  SET_CLIENT_NAME: 50,
  DEVICE_LIST_UPDATED: 100,
  RGBCONTROLLER_UPDATELEDS: 1050,
  RGBCONTROLLER_SETCUSTOMMODE: 1100,
} as const;

/** OpenRGB device_type enum (order is part of the API). */
export const DEVICE_TYPES = [
  'motherboard', 'dram', 'gpu', 'cooler', 'ledstrip', 'keyboard', 'mouse', 'mousemat', 'headset',
  'headset_stand', 'gamepad', 'light', 'speaker', 'virtual', 'storage', 'case', 'microphone',
  'accessory', 'keypad', 'laptop', 'monitor', 'unknown',
] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const ZONE_SINGLE = 0;
export const ZONE_LINEAR = 1;
export const ZONE_MATRIX = 2;

export interface OrgbZone {
  name: string;
  type: number;
  ledsMin: number;
  ledsMax: number;
  ledsCount: number;
  /** Keyboard-style layouts: matrix[row][col] = LED index within the zone, or 0xFFFFFFFF. */
  matrix?: { height: number; width: number; map: number[] };
}

export interface OrgbController {
  index: number;
  type: DeviceType;
  name: string;
  vendor: string;
  description: string;
  serial: string;
  location: string;
  modes: string[];
  activeMode: number;
  zones: OrgbZone[];
  ledCount: number;
}

/** Sequential little-endian reader over a controller data blob. */
class Reader {
  private o = 0;
  private readonly b: Buffer;
  constructor(b: Buffer) {
    this.b = b;
  }
  u16() {
    const v = this.b.readUInt16LE(this.o);
    this.o += 2;
    return v;
  }
  u32() {
    const v = this.b.readUInt32LE(this.o);
    this.o += 4;
    return v;
  }
  i32() {
    const v = this.b.readInt32LE(this.o);
    this.o += 4;
    return v;
  }
  str() {
    const n = this.u16();
    const s = this.b.toString('utf8', this.o, this.o + n).replace(/\0+$/, '');
    this.o += n;
    return s;
  }
  skip(n: number) {
    this.o += n;
  }
}

export function parseController(index: number, data: Buffer, version: number): OrgbController {
  const r = new Reader(data);
  r.u32(); // data size
  const typeIdx = r.i32();
  const name = r.str();
  const vendor = version >= 1 ? r.str() : '';
  const description = r.str();
  r.str(); // version string
  const serial = r.str();
  const location = r.str();

  const numModes = r.u16();
  const activeMode = r.i32();
  const modes: string[] = [];
  for (let m = 0; m < numModes; m++) {
    modes.push(r.str());
    r.i32(); // value
    r.u32(); // flags
    r.u32(); // speed min
    r.u32(); // speed max
    if (version >= 3) {
      r.u32(); // brightness min
      r.u32(); // brightness max
    }
    r.u32(); // colors min
    r.u32(); // colors max
    r.u32(); // speed
    if (version >= 3) r.u32(); // brightness
    r.u32(); // direction
    r.u32(); // color mode
    r.skip(r.u16() * 4); // mode colors
  }

  const numZones = r.u16();
  const zones: OrgbZone[] = [];
  for (let z = 0; z < numZones; z++) {
    const zone: OrgbZone = { name: r.str(), type: r.i32(), ledsMin: r.u32(), ledsMax: r.u32(), ledsCount: r.u32() };
    const matrixLen = r.u16();
    if (matrixLen > 0) {
      const height = r.u32();
      const width = r.u32();
      const map: number[] = [];
      for (let i = 0; i < height * width; i++) map.push(r.u32());
      zone.matrix = { height, width, map };
    }
    if (version >= 4) {
      const numSegments = r.u16();
      for (let s = 0; s < numSegments; s++) {
        r.str(); // segment name
        r.i32(); // type
        r.u32(); // start
        r.u32(); // count
      }
    }
    zones.push(zone);
  }

  const numLeds = r.u16();
  for (let l = 0; l < numLeds; l++) {
    r.str(); // led name
    r.u32(); // value
  }

  return {
    index,
    type: DEVICE_TYPES[typeIdx] ?? 'unknown',
    name,
    vendor,
    description,
    serial,
    location,
    modes,
    activeMode,
    zones,
    ledCount: numLeds,
  };
}

/** Promise-based connection to an OpenRGB SDK server. Emits 'devicesChanged' and 'close'. */
export class OpenRgbClient extends EventEmitter {
  private sock: net.Socket | null = null;
  private buf = Buffer.alloc(0);
  private waiters: { id: number; dev: number; resolve: (b: Buffer) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }[] = [];
  version = 0;

  connect(port = 6742, host = '127.0.0.1', timeoutMs = 2000): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ port, host });
      const fail = (err: Error) => {
        sock.destroy();
        reject(err);
      };
      const t = setTimeout(() => fail(new Error('OpenRGB did not answer')), timeoutMs);
      sock.once('error', (e) => {
        clearTimeout(t);
        fail(e);
      });
      sock.once('connect', async () => {
        clearTimeout(t);
        sock.removeAllListeners('error');
        sock.setNoDelay(true);
        this.sock = sock;
        sock.on('data', (d: Buffer) => this.onData(d));
        sock.on('error', () => sock.destroy());
        sock.on('close', () => {
          this.sock = null;
          for (const w of this.waiters.splice(0)) {
            clearTimeout(w.timer);
            w.reject(new Error('OpenRGB connection closed'));
          }
          this.emit('close');
        });
        try {
          // Ask for our highest version; an old (v0) server simply never replies.
          const reply = await this.request(PKT.REQUEST_PROTOCOL_VERSION, 0, u32(PROTOCOL), 1500).catch(() => null);
          this.version = reply ? Math.min(PROTOCOL, reply.readUInt32LE(0)) : 0;
          this.send(PKT.SET_CLIENT_NAME, 0, Buffer.from('Bloom\0', 'utf8'));
          resolve();
        } catch (e) {
          reject(e as Error);
        }
      });
    });
  }

  get connected(): boolean {
    return !!this.sock && !this.sock.destroyed;
  }

  close(): void {
    this.sock?.destroy();
    this.sock = null;
  }

  private send(id: number, dev: number, payload: Buffer = Buffer.alloc(0)): void {
    if (!this.sock) throw new Error('Not connected to OpenRGB');
    const h = Buffer.alloc(16);
    h.write('ORGB', 0, 'ascii');
    h.writeUInt32LE(dev, 4);
    h.writeUInt32LE(id, 8);
    h.writeUInt32LE(payload.length, 12);
    this.sock.write(payload.length ? Buffer.concat([h, payload]) : h);
  }

  private request(id: number, dev: number, payload?: Buffer, timeoutMs = 5000): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w.timer !== timer);
        reject(new Error(`OpenRGB request ${id} timed out`));
      }, timeoutMs);
      this.waiters.push({ id, dev, resolve, reject, timer });
      this.send(id, dev, payload);
    });
  }

  private onData(d: Buffer): void {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 16) {
      if (this.buf.toString('ascii', 0, 4) !== 'ORGB') {
        // Lost sync; drop the connection rather than misread data.
        this.close();
        return;
      }
      const size = this.buf.readUInt32LE(12);
      if (this.buf.length < 16 + size) return;
      const dev = this.buf.readUInt32LE(4);
      const id = this.buf.readUInt32LE(8);
      const payload = this.buf.subarray(16, 16 + size);
      this.buf = this.buf.subarray(16 + size);
      if (id === PKT.DEVICE_LIST_UPDATED) {
        this.emit('devicesChanged');
        continue;
      }
      const i = this.waiters.findIndex((w) => w.id === id && w.dev === dev);
      if (i >= 0) {
        const [w] = this.waiters.splice(i, 1);
        clearTimeout(w.timer);
        w.resolve(Buffer.from(payload));
      }
    }
  }

  async controllers(): Promise<OrgbController[]> {
    const count = (await this.request(PKT.REQUEST_CONTROLLER_COUNT, 0)).readUInt32LE(0);
    const out: OrgbController[] = [];
    for (let i = 0; i < count; i++) {
      const data = await this.request(PKT.REQUEST_CONTROLLER_DATA, i, this.version > 0 ? u32(this.version) : undefined);
      out.push(parseController(i, data, this.version));
    }
    return out;
  }

  /** Put a device in its direct / per-LED mode so it shows the colors we send. */
  setCustomMode(index: number): void {
    this.send(PKT.RGBCONTROLLER_SETCUSTOMMODE, index);
  }

  /** Set every LED on a device at once. `rgb` is R,G,B bytes in the device's LED order. */
  updateLeds(index: number, rgb: Uint8Array, ledCount: number): void {
    const size = 4 + 2 + ledCount * 4;
    const p = Buffer.alloc(size);
    p.writeUInt32LE(size, 0);
    p.writeUInt16LE(ledCount, 4);
    for (let i = 0; i < ledCount; i++) {
      // RGBColor is 0x00BBGGRR, i.e. bytes R, G, B, 0 in little-endian.
      p[6 + i * 4] = rgb[i * 3] ?? 0;
      p[7 + i * 4] = rgb[i * 3 + 1] ?? 0;
      p[8 + i * 4] = rgb[i * 3 + 2] ?? 0;
    }
    this.send(PKT.RGBCONTROLLER_UPDATELEDS, index, p);
  }
}

function u32(v: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v, 0);
  return b;
}
