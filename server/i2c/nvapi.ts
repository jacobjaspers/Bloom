// Raw I2C on an NVIDIA graphics card through the driver's own API (nvapi64.dll).
// Board-partner RGB controllers (Gigabyte, MSI, EVGA…) hang off the GPU's I2C bus,
// not the motherboard SMBus, so this is how the GPU logo is reached.
//
// nvapi64.dll exports a single function, nvapi_QueryInterface(id), which returns the
// address of each API function; we call those addresses through koffi.

import koffi from 'koffi';

const ID = {
  Initialize: 0x0150e828,
  EnumPhysicalGPUs: 0xe5ac921f,
  GetPCIIdentifiers: 0x2ddfb66e,
  GetFullName: 0xceee8e9f,
  I2CWriteEx: 0x283ac65a,
  I2CReadEx: 0x4d7b0709,
} as const;

const NV_I2C_INFO_V3 = koffi.struct('NV_I2C_INFO_V3', {
  version: 'uint32_t',
  display_mask: 'uint32_t',
  is_ddc_port: 'uint8_t',
  i2c_dev_address: 'uint8_t',
  i2c_reg_address: 'void *',
  reg_addr_size: 'uint32_t',
  data: 'void *',
  size: 'uint32_t',
  i2c_speed: 'uint32_t',
  i2c_speed_khz: 'uint32_t',
  port_id: 'uint8_t',
  is_port_id_set: 'uint32_t',
});
const INFO_VERSION = (3 << 16) | koffi.sizeof(NV_I2C_INFO_V3);

const P = {
  init: koffi.proto('int32_t NvInit()'),
  enumGpus: koffi.proto('int32_t NvEnumGpus(_Out_ void **handles, _Out_ int32_t *count)'),
  pciIds: koffi.proto(
    'int32_t NvPciIds(void *gpu, _Out_ uint32_t *dev, _Out_ uint32_t *sub, _Out_ uint32_t *rev, _Out_ uint32_t *ext)',
  ),
  fullName: koffi.proto('int32_t NvFullName(void *gpu, _Out_ uint8_t *name)'),
  i2c: koffi.proto('int32_t NvI2C(void *gpu, NV_I2C_INFO_V3 *info, _Inout_ uint32_t *unknown)'),
};

export interface NvGpu {
  index: number;
  handle: unknown;
  name: string;
  vendor: number;
  device: number;
  subVendor: number;
  subDevice: number;
}

export class NvApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

let api: { query: (id: number) => unknown } | null = null;

function load() {
  if (api) return api;
  if (process.platform !== 'win32') throw new NvApiError('platform', 'NvAPI is Windows-only');
  let lib: ReturnType<typeof koffi.load>;
  try {
    lib = koffi.load('nvapi64.dll');
  } catch {
    throw new NvApiError('no-driver', 'NVIDIA driver API (nvapi64.dll) not found');
  }
  const qi = lib.func('void * nvapi_QueryInterface(uint32_t id)');
  const query = (id: number) => {
    const ptr = qi(id);
    if (!ptr) throw new NvApiError('missing', `NvAPI function 0x${id.toString(16)} unavailable`);
    return ptr;
  };
  const rc = koffi.call(query(ID.Initialize), P.init) as number;
  if (rc !== 0) throw new NvApiError('init', `NvAPI_Initialize failed (${rc})`);
  api = { query };
  return api;
}

export function listNvidiaGpus(): NvGpu[] {
  const { query } = load();
  const handles: unknown[] = new Array(64).fill(null);
  const count = [0];
  const rc = koffi.call(query(ID.EnumPhysicalGPUs), P.enumGpus, handles, count) as number;
  if (rc !== 0) throw new NvApiError('enum', `NvAPI_EnumPhysicalGPUs failed (${rc})`);
  const gpus: NvGpu[] = [];
  for (let i = 0; i < count[0]; i++) {
    const dev = [0], sub = [0], rev = [0], ext = [0];
    if ((koffi.call(query(ID.GetPCIIdentifiers), P.pciIds, handles[i], dev, sub, rev, ext) as number) !== 0) continue;
    const nameBuf = Buffer.alloc(64);
    koffi.call(query(ID.GetFullName), P.fullName, handles[i], nameBuf);
    gpus.push({
      index: i,
      handle: handles[i],
      name: nameBuf.toString('latin1').replace(/\0.*$/s, ''),
      vendor: dev[0] & 0xffff,
      device: dev[0] >>> 16,
      subVendor: sub[0] & 0xffff,
      subDevice: sub[0] >>> 16,
    });
  }
  return gpus;
}

/**
 * Raw I2C (no register byte) to an allow-listed set of 7-bit addresses on one GPU.
 * The GPU I2C bus also carries things like the VRM controller; nothing else is reachable.
 */
export class NvI2c {
  readonly gpu: NvGpu;
  private readonly allowed: ReadonlySet<number>;
  private readonly write: unknown;
  private readonly read: unknown;
  private readonly buf: unknown;
  private static readonly MAX = 32;

  constructor(gpu: NvGpu, allowed: Iterable<number>) {
    const { query } = load();
    this.gpu = gpu;
    this.allowed = new Set(allowed);
    this.write = query(ID.I2CWriteEx);
    this.read = query(ID.I2CReadEx);
    this.buf = koffi.alloc('uint8_t', NvI2c.MAX);
  }

  private info(addr: number, size: number) {
    if (!this.allowed.has(addr)) throw new Error(`GPU I2C address 0x${addr.toString(16)} is not on the allow-list`);
    return {
      version: INFO_VERSION,
      display_mask: 0,
      is_ddc_port: 0,
      i2c_dev_address: (addr << 1) & 0xff,
      i2c_reg_address: null,
      reg_addr_size: 0,
      data: this.buf,
      size,
      i2c_speed: 0xffff,
      i2c_speed_khz: 0, // driver default
      port_id: 1,
      is_port_id_set: 1,
    };
  }

  /** Returns the NvAPI status (0 = OK). */
  writeRaw(addr: number, bytes: ArrayLike<number>): number {
    if (bytes.length > NvI2c.MAX) throw new Error('I2C write too long');
    koffi.encode(this.buf, 'uint8_t', Array.from(bytes), bytes.length);
    return koffi.call(this.write, P.i2c, this.gpu.handle, this.info(addr, bytes.length), [0]) as number;
  }

  readRaw(addr: number, len: number): { status: number; data: number[] } {
    if (len > NvI2c.MAX) throw new Error('I2C read too long');
    koffi.encode(this.buf, 'uint8_t', new Array(len).fill(0), len);
    const status = koffi.call(this.read, P.i2c, this.gpu.handle, this.info(addr, len), [0]) as number;
    // Copy the reply out (koffi.decode) instead of mapping native memory with koffi.view:
    // Electron's V8 memory sandbox aborts the process on external ArrayBuffers.
    const data = Array.from(koffi.decode(this.buf, 'uint8_t', len) as ArrayLike<number>);
    return { status, data };
  }

  close(): void {
    koffi.free(this.buf);
  }
}
