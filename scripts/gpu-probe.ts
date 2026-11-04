// GPU RGB probe: lists NVIDIA GPUs, then talks only to the Gigabyte logo controller
// address (0x32): one plain read, then the standard AB status handshake. No lighting changes.
import { listNvidiaGpus, NvI2c } from '../server/i2c/nvapi.ts';

const ADDR = 0x32;
const hex = (a: number[]) => a.map((b) => b.toString(16).padStart(2, '0')).join(' ');
const gpu = listNvidiaGpus().find((g) => g.subVendor === 0x1458);
if (!gpu) {
  console.log('No Gigabyte NVIDIA GPU found');
  process.exit(1);
}
console.log(`GPU: ${gpu.name} ${gpu.device.toString(16)}:${gpu.subDevice.toString(16)}`);
const bus = new NvI2c(gpu, [ADDR]);
const r1 = bus.readRaw(ADDR, 4);
console.log(`plain read      status=${r1.status} data=[${hex(r1.data)}]`);
const w = bus.writeRaw(ADDR, [0xab, 0, 0, 0, 0, 0, 0, 0]);
const r2 = bus.readRaw(ADDR, 4);
console.log(`AB handshake    write=${w} status=${r2.status} data=[${hex(r2.data)}]`);
bus.close();
