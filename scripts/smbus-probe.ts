// Read-only SMBus probe: lists which ENE-candidate addresses ACK and dumps their
// identification registers. Never writes to the RAM controllers. Run as administrator.
import { PawnIoSmbus } from '../server/smbus/pawnio.ts';
import { GuardedSmbus } from '../server/smbus/smbus.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ADDRS = [0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f, 0x40, 0x4f, 0x66, 0x67, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77];
try {
  const raw = new PawnIoSmbus(path.join(here, '..', 'server', 'smbus', 'modules', 'SmbusI801.bin'));
  console.log('opened:', raw.name);
  const bus = new GuardedSmbus(raw, ADDRS);
  for (const a of ADDRS) {
    if (!bus.quickWrite(a)) continue;
    const p90 = Array.from({ length: 16 }, (_, i) => bus.readByteData(a, 0x90 + i));
    const pA0 = Array.from({ length: 16 }, (_, i) => bus.readByteData(a, 0xa0 + i));
    console.log(`0x${a.toString(16)} ACK  90:[${p90.join(',')}]  A0:[${pA0.join(',')}]`);
  }
  bus.close();
} catch (e) {
  const err = e as { code?: string; message?: string };
  console.log('ERR', err.code ?? '', err.message);
}
