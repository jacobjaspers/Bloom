// Read-only SMBus diagnostic: raw HRESULTs for quick/byte-read probes.
// The only SPD access is a single byte read from 0x50 (no writes) to confirm the bus works.
import { PawnIoSmbus } from '../server/smbus/pawnio.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const raw = new PawnIoSmbus(path.join(here, '..', 'server', 'smbus', 'modules', 'SmbusI801.bin'));
const x = (raw as any).xfer.bind(raw) as (a: number, rw: number, cmd: number, proto: number) => number;
const out = (raw as any).outBuf as BigUint64Array;
const hex = (n: number) => '0x' + (n >>> 0).toString(16);
console.log('opened:', raw.name);
console.log('SPD 0x50 read byte_data cmd0:', hex(x(0x50, 1, 0, 2)), 'value', Number(out[0] & 0xffn));
console.log('SPD 0x51 read byte_data cmd0:', hex(x(0x51, 1, 0, 2)), 'value', Number(out[0] & 0xffn));
for (const a of [0x39, 0x3a, 0x77]) {
  console.log(`0x${a.toString(16)} quick:`, hex(x(a, 0, 0, 0)), ' readbyte(0x90):', hex(x(a, 1, 0x90, 2)), 'val', Number(out[0] & 0xffn), ' recvbyte:', hex(x(a, 1, 0, 1)));
}
raw.close();
