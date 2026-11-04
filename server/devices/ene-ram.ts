// DDR4 RAM lighting driven by an ENE SMBus controller on each stick (G.Skill Trident Z
// RGB, ASUS-Aura-compatible kits, many others). Model string on these sticks is
// "DIMM_LED-0103".
//
// ENE register access is indirect: write the 16-bit register number (big-endian) as an
// SMBus word to command 0x00, then read a byte from 0x81, write a byte to 0x01, or write
// a block to 0x03.
//
// All sticks power up sharing address 0x77; each must be moved to its own address by
// writing a slot index to 0x80F8 and the new (8-bit) address to 0x80F9. This lasts until
// the next power cycle.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeviceStatus, ZoneInfo } from '../../shared/types.ts';
import { GuardedSmbus, type SmbusHost } from '../smbus/smbus.ts';
import { PawnIoError, PawnIoSmbus } from '../smbus/pawnio.ts';
import { errorMessage, type LightDevice } from './device.ts';

const BOOT_ADDR = 0x77;
const ENE_ADDRS = [0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f, 0x40, 0x4f, 0x66, 0x67, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76];

const REG = {
  deviceName: 0x1000,
  manufacturer: 0x1030,
  configTable: 0x1c00,
  colorsDirectV1: 0x8000,
  colorsDirectV2: 0x8100,
  directMode: 0x8020,
  apply: 0x802f,
  slotIndex: 0x80f8,
  slotAddress: 0x80f9,
} as const;

const KNOWN_MODELS: Record<string, 'V1' | 'V2'> = {
  'LED-0116': 'V1',
  'AUMA0-E8K4-0101': 'V1',
  'DIMM_LED-0102': 'V1',
  'DIMM_LED-0103': 'V1',
  'AUDA0-E6K5-0101': 'V2',
  'AUMA0-E6K5-0104': 'V2',
  'AUMA0-E6K5-0105': 'V2',
  'AUMA0-E6K5-0106': 'V2',
};

interface Stick {
  addr: number;
  model: string;
  version: 'V1' | 'V2';
  leds: number;
  last: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = process.env.LUMEN_SMBUS_MODULE ?? path.join(here, '..', 'smbus', 'modules', 'SmbusI801.bin');

const sleep = (ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* short busy-wait; only used during detection */ }
};

class Ene {
  private readonly bus: SmbusHost;
  constructor(bus: SmbusHost) {
    this.bus = bus;
  }
  private select(addr: number, reg: number) {
    this.bus.writeWordData(addr, 0x00, ((reg << 8) & 0xff00) | ((reg >> 8) & 0xff));
  }
  read(addr: number, reg: number): number {
    this.select(addr, reg);
    return this.bus.readByteData(addr, 0x81);
  }
  write(addr: number, reg: number, value: number) {
    this.select(addr, reg);
    this.bus.writeByteData(addr, 0x01, value);
  }
  writeBlock(addr: number, reg: number, data: number[]) {
    this.select(addr, reg);
    this.bus.writeBlockData(addr, 0x03, data);
  }
  readString(addr: number, reg: number, len: number): string {
    const chars: number[] = [];
    for (let i = 0; i < len; i++) {
      const c = this.read(addr, reg + i);
      if (c > 0) chars.push(c);
    }
    return String.fromCharCode(...chars);
  }
  /** ENE controllers mirror their own register index in raw SMBus registers 0x90–0x9F or 0xA0–0xAF. */
  looksLikeEne(addr: number): boolean {
    const test = (base: number, offset: number) => {
      let pass = 0;
      for (let i = 0; i < 16; i++) if (this.bus.readByteData(addr, base + i) === offset + i) pass++;
      return pass >= 15;
    };
    try {
      return test(0x90, 0x10) || test(0xa0, 0x00);
    } catch {
      return false;
    }
  }
}

export class EneRam implements LightDevice {
  readonly id = 'ram';
  name = 'DDR4 RGB Memory';
  private bus: SmbusHost | null = null;
  private ene: Ene | null = null;
  private sticks: Stick[] = [];
  private failures = 0;
  private state: DeviceStatus = { id: this.id, name: this.name, state: 'unavailable', detail: 'Not opened yet' };

  status(): DeviceStatus {
    return { ...this.state, name: this.name };
  }

  async open(): Promise<void> {
    this.name = describeMemory() ?? 'DDR4 RGB Memory';
    try {
      const raw = new PawnIoSmbus(MODULE_PATH);
      this.bus = new GuardedSmbus(raw, [BOOT_ADDR, ...ENE_ADDRS]);
      this.ene = new Ene(this.bus);
      this.remapBootAddress();
      this.sticks = this.detect();
      if (!this.sticks.length) {
        const locked = raw.timeouts > 5;
        this.state = {
          id: this.id,
          name: this.name,
          state: locked ? 'error' : 'unavailable',
          detail: locked
            ? `${raw.name} is locked: every transfer times out`
            : `No ENE RAM controllers found on ${raw.name}`,
          hint: locked
            ? 'Another driver left the SMBus controller busy. Disable SignalRGB at startup, reboot, then start Lumen as administrator.'
            : 'If SignalRGB or another RGB app is running, quit it and restart Lumen.',
        };
        this.close();
        return;
      }
      for (const s of this.sticks) this.ene.write(s.addr, REG.directMode, 0x01);
      this.state = {
        id: this.id,
        name: this.name,
        state: 'connected',
        detail: `${this.sticks.length} sticks · ${this.sticks[0].model} · ${raw.name}`,
      };
    } catch (err) {
      this.close();
      const e = err as PawnIoError;
      const hints: Record<string, string> = {
        'no-driver': 'Install the PawnIO driver from pawnio.eu, then restart Lumen.',
        'no-module': 'Download SmbusI801.bin from the PawnIO.Modules releases into server/smbus/modules/.',
        'access-denied': 'Start Lumen from an administrator terminal to control RAM lighting.',
      };
      this.state = {
        id: this.id,
        name: this.name,
        state: e?.code === 'no-driver' || e?.code === 'no-module' || e?.code === 'access-denied' ? 'unavailable' : 'error',
        detail: errorMessage(err),
        hint: hints[e?.code ?? ''],
      };
    }
  }

  /** Give every stick still sitting on the shared boot address its own address. */
  private remapBootAddress() {
    const bus = this.bus!;
    const ene = this.ene!;
    for (let slot = 0; slot < 8; slot++) {
      if (!bus.quickWrite(BOOT_ADDR)) return;
      if (!ene.looksLikeEne(BOOT_ADDR)) return; // something else lives at 0x77 — leave it alone
      const free = ENE_ADDRS.find((a) => !bus.quickWrite(a));
      if (free === undefined) return;
      ene.write(BOOT_ADDR, REG.slotIndex, slot);
      sleep(2);
      ene.write(BOOT_ADDR, REG.slotAddress, free << 1);
      sleep(2);
    }
  }

  private detect(): Stick[] {
    const bus = this.bus!;
    const ene = this.ene!;
    const found: Stick[] = [];
    for (const addr of ENE_ADDRS) {
      if (!bus.quickWrite(addr)) continue;
      if (!ene.looksLikeEne(addr)) continue;
      let model = '';
      for (let tries = 0; tries < 3 && !(model in KNOWN_MODELS); tries++) model = ene.readString(addr, REG.deviceName, 16);
      if (!(model in KNOWN_MODELS)) continue;
      if (ene.readString(addr, REG.manufacturer, 21).includes('Micron')) continue; // Ballistix: different protocol
      let leds = 0;
      for (let tries = 0; tries < 10 && (leds < 1 || leds > 15); tries++) {
        leds = Math.max(ene.read(addr, REG.configTable + 2), ene.read(addr, REG.configTable + 3));
      }
      if (leds < 1 || leds > 15) continue;
      found.push({ addr, model, version: KNOWN_MODELS[model], leds, last: '' });
    }
    return found;
  }

  zones(): ZoneInfo[] {
    return this.sticks.map((s, i) => ({
      id: `ram:${s.addr.toString(16)}`,
      deviceId: this.id,
      kind: 'ram',
      name: `DIMM ${i + 1}`,
      maxLeds: s.leds,
      configurable: false,
    }));
  }

  write(frame: Map<string, Uint8Array>): void {
    if (!this.ene || this.state.state !== 'connected') return;
    for (const s of this.sticks) {
      const src = frame.get(`ram:${s.addr.toString(16)}`);
      if (!src) continue;
      const data: number[] = [];
      for (let i = 0; i < s.leds; i++) {
        // ENE expects R, B, G.
        data.push(src[i * 3] ?? 0, src[i * 3 + 2] ?? 0, src[i * 3 + 1] ?? 0);
      }
      const key = data.join(',');
      if (key === s.last) continue;
      try {
        const base = s.version === 'V1' ? REG.colorsDirectV1 : REG.colorsDirectV2;
        for (let off = 0; off < data.length; off += 15) this.ene.writeBlock(s.addr, base + off, data.slice(off, off + 15));
        this.ene.write(s.addr, REG.apply, 0x01);
        s.last = key;
        this.failures = 0;
      } catch (err) {
        if (++this.failures > 20) {
          this.state = { ...this.state, state: 'error', detail: `SMBus write failed: ${errorMessage(err)}` };
        }
      }
    }
  }

  close(): void {
    this.bus?.close();
    this.bus = null;
    this.ene = null;
  }
}

/** "G.Skill Trident Z RGB" from the DIMM part number, when we can recognise it. */
function describeMemory(): string | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', '(Get-CimInstance Win32_PhysicalMemory | Select-Object -First 1).PartNumber'],
      { encoding: 'utf8', timeout: 8000, windowsHide: true },
    ).trim();
    if (/^F4-.*TZR/i.test(out)) return 'G.Skill Trident Z RGB';
    if (/^F4-.*TZN/i.test(out)) return 'G.Skill Trident Z Neo';
    if (/^F4-.*TR/i.test(out)) return 'G.Skill Trident Z Royal';
    return out ? `RGB Memory (${out})` : null;
  } catch {
    return null;
  }
}
