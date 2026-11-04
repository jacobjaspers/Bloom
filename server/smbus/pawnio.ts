// SMBus access on Windows through PawnIO (https://pawnio.eu), a signed kernel driver
// that runs small sandboxed modules. We load the official SmbusI801 module, which talks
// to the Intel PCH SMBus controller (B560 → "Intel SMBus 43A3").
//
// ABI (PawnIOLib.h / SmbusI801.p):
//   HRESULT pawnio_open(HANDLE*); pawnio_load(HANDLE, const UCHAR*, SIZE_T);
//   HRESULT pawnio_execute(HANDLE, PCSTR fn, const ULONG64* in, SIZE_T in_n,
//                          ULONG64* out, SIZE_T out_n, SIZE_T* ret_n);
//   ioctl_smbus_xfer: in[0]=addr in[1]=read(1)/write(0) in[2]=command in[3]=protocol
//                     in[4..8]=data (i2c_smbus_data, byte packed: block[0] = length)
//                     out[0..4]=data (same packing)
// Every transfer holds the system-wide "Access_SMBUS.HTP.Method" mutex that hardware
// monitors (HWiNFO, AIDA64, OpenRGB, SignalRGB…) use to avoid colliding on the bus.

import fs from 'node:fs';
import path from 'node:path';
import koffi from 'koffi';
import type { SmbusHost } from './smbus.ts';

type KoffiFn = ReturnType<ReturnType<typeof koffi.load>['func']>;

const PROTO = { QUICK: 0, BYTE: 1, BYTE_DATA: 2, WORD_DATA: 3, BLOCK_DATA: 5 } as const;
const READ = 1;
const WRITE = 0;
const E_ACCESSDENIED = 0x80070005 | 0;
/** HRESULT_FROM_WIN32(ERROR_SEM_TIMEOUT), what STATUS_IO_TIMEOUT surfaces as. */
const HR_IO_TIMEOUT = 0x80070079;

export class PawnIoError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const DLL_CANDIDATES = [
  process.env.LUMEN_PAWNIO_DLL,
  path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PawnIO', 'PawnIOLib.dll'),
  path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'PawnIOLib.dll'),
].filter((p): p is string => !!p);

export function findPawnIoDll(): string | null {
  return DLL_CANDIDATES.find((p) => fs.existsSync(p)) ?? null;
}

export class PawnIoSmbus implements SmbusHost {
  readonly name: string;
  private readonly handle: unknown;
  private readonly execute: KoffiFn;
  private readonly closeFn: KoffiFn;
  private readonly mutex: unknown;
  private readonly wait: KoffiFn;
  private readonly release: KoffiFn;
  private readonly inBuf = new BigUint64Array(9);
  private readonly outBuf = new BigUint64Array(5);
  private readonly retBuf = new BigUint64Array(1);
  private closed = false;
  /**
   * Consecutive transfers that timed out. The i801 module returns a timeout when the
   * controller's hardware INUSE semaphore never clears — i.e. another driver (often
   * one whose app was killed mid-transfer) left the bus locked. Only a reboot clears it.
   */
  timeouts = 0;

  constructor(modulePath: string) {
    if (process.platform !== 'win32') throw new PawnIoError('platform', 'PawnIO is Windows-only');
    const dll = findPawnIoDll();
    if (!dll) throw new PawnIoError('no-driver', 'PawnIO is not installed');
    if (!fs.existsSync(modulePath)) throw new PawnIoError('no-module', `SMBus module not found at ${modulePath}`);

    const lib = koffi.load(dll);
    const HANDLE = koffi.pointer('PAWNIO_HANDLE', koffi.opaque());
    const open = lib.func('__stdcall', 'pawnio_open', 'int32', [koffi.out(koffi.pointer(HANDLE))]);
    const load = lib.func('__stdcall', 'pawnio_load', 'int32', [HANDLE, 'void *', 'size_t']);
    this.execute = lib.func('__stdcall', 'pawnio_execute', 'int32', [
      HANDLE, 'str', 'void *', 'size_t', 'void *', 'size_t', 'void *',
    ]);
    this.closeFn = lib.func('__stdcall', 'pawnio_close', 'int32', [HANDLE]);

    const out = [null];
    const hr = open(out) as number;
    if (hr === E_ACCESSDENIED) {
      throw new PawnIoError('access-denied', 'PawnIO needs administrator rights — run Lumen as administrator');
    }
    if (hr !== 0) throw new PawnIoError('open', `pawnio_open failed (0x${(hr >>> 0).toString(16)})`);
    this.handle = out[0];

    const blob = fs.readFileSync(modulePath);
    const lhr = load(this.handle, blob, blob.length) as number;
    if (lhr !== 0) {
      this.closeFn(this.handle);
      throw new PawnIoError('load', `Could not load SMBus module (0x${(lhr >>> 0).toString(16)}) — is this an Intel chipset?`);
    }

    const k32 = koffi.load('kernel32.dll');
    const createMutex = k32.func('__stdcall', 'CreateMutexA', 'void *', ['void *', 'int', 'str']);
    this.wait = k32.func('__stdcall', 'WaitForSingleObject', 'uint32', ['void *', 'uint32']);
    this.release = k32.func('__stdcall', 'ReleaseMutex', 'int', ['void *']);
    this.mutex = createMutex(null, 0, 'Global\\Access_SMBUS.HTP.Method');

    // Identify the controller for the status line.
    const id = new BigUint64Array(3);
    const r = this.execute(this.handle, 'ioctl_identity', new BigUint64Array(1), 1, id, 3, this.retBuf) as number;
    if (r === 0) {
      const tag = Buffer.from(new BigUint64Array([id[0]]).buffer).toString('latin1').replace(/\0+$/, '');
      const dev = Number((id[2] >> 16n) & 0xffffn).toString(16).toUpperCase();
      this.name = `PawnIO SMBus ${tag || 'i801'} (8086:${dev})`;
    } else {
      this.name = 'PawnIO SMBus';
    }
  }

  private xfer(addr: number, rw: number, cmd: number, protocol: number, fill?: (bytes: Uint8Array) => void): number {
    if (this.closed) throw new Error('SMBus closed');
    const inp = this.inBuf;
    inp.fill(0n);
    inp[0] = BigInt(addr);
    inp[1] = BigInt(rw);
    inp[2] = BigInt(cmd);
    inp[3] = BigInt(protocol);
    if (fill) fill(new Uint8Array(inp.buffer, 4 * 8, 5 * 8));
    this.outBuf.fill(0n);

    const WAIT_OBJECT_0 = 0;
    const WAIT_ABANDONED = 0x80;
    const w = this.mutex ? (this.wait(this.mutex, 500) as number) : WAIT_OBJECT_0;
    if (w !== WAIT_OBJECT_0 && w !== WAIT_ABANDONED) throw new Error('SMBus is busy (mutex timeout)');
    try {
      const hr = this.execute(this.handle, 'ioctl_smbus_xfer', inp, 9, this.outBuf, 5, this.retBuf) as number;
      if ((hr >>> 0) === HR_IO_TIMEOUT) this.timeouts++;
      else if (hr === 0) this.timeouts = 0;
      return hr;
    } finally {
      if (this.mutex) this.release(this.mutex);
    }
  }

  private must(hr: number, what: string, addr: number) {
    if (hr !== 0) throw new Error(`${what} @0x${addr.toString(16)} failed (0x${(hr >>> 0).toString(16)})`);
  }

  quickWrite(addr: number): boolean {
    return this.xfer(addr, WRITE, 0, PROTO.QUICK) === 0;
  }

  readByteData(addr: number, cmd: number): number {
    this.must(this.xfer(addr, READ, cmd, PROTO.BYTE_DATA), 'read byte', addr);
    return Number(this.outBuf[0] & 0xffn);
  }

  writeByteData(addr: number, cmd: number, value: number): void {
    this.must(this.xfer(addr, WRITE, cmd, PROTO.BYTE_DATA, (b) => (b[0] = value & 0xff)), 'write byte', addr);
  }

  writeWordData(addr: number, cmd: number, value: number): void {
    this.must(
      this.xfer(addr, WRITE, cmd, PROTO.WORD_DATA, (b) => {
        b[0] = value & 0xff;
        b[1] = (value >> 8) & 0xff;
      }),
      'write word',
      addr,
    );
  }

  writeBlockData(addr: number, cmd: number, data: ArrayLike<number>): void {
    if (data.length < 1 || data.length > 32) throw new Error('SMBus block must be 1–32 bytes');
    this.must(
      this.xfer(addr, WRITE, cmd, PROTO.BLOCK_DATA, (b) => {
        b[0] = data.length;
        for (let i = 0; i < data.length; i++) b[1 + i] = data[i] & 0xff;
      }),
      'write block',
      addr,
    );
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.closeFn(this.handle);
    } catch { /* ignore */ }
  }
}
