/** Minimal SMBus host interface, modelled on Linux i2c_smbus_* semantics. */
export interface SmbusHost {
  readonly name: string;
  /** SMBus quick write; returns true when a device ACKs the address. */
  quickWrite(addr: number): boolean;
  readByteData(addr: number, cmd: number): number;
  writeByteData(addr: number, cmd: number, value: number): void;
  writeWordData(addr: number, cmd: number, value: number): void;
  writeBlockData(addr: number, cmd: number, data: ArrayLike<number>): void;
  close(): void;
}

/**
 * Wraps a host and refuses any traffic to addresses outside an allow-list.
 * RAM lighting sits on the same bus as the DIMM SPD EEPROMs (0x50–0x57) and their
 * page/write-protect registers (0x30–0x37); a stray write there can corrupt the
 * memory's timing data. Every transaction goes through this guard.
 */
export class GuardedSmbus implements SmbusHost {
  private readonly host: SmbusHost;
  private readonly allowed: ReadonlySet<number>;

  constructor(host: SmbusHost, allowed: Iterable<number>) {
    this.host = host;
    this.allowed = new Set(allowed);
    for (const a of this.allowed) {
      if ((a >= 0x30 && a <= 0x37) || (a >= 0x50 && a <= 0x57)) {
        throw new Error(`Refusing to allow SPD address 0x${a.toString(16)}`);
      }
    }
  }

  get name() {
    return this.host.name;
  }

  private check(addr: number) {
    if (!this.allowed.has(addr)) throw new Error(`SMBus address 0x${addr.toString(16)} is not on the allow-list`);
  }

  quickWrite(addr: number) {
    this.check(addr);
    return this.host.quickWrite(addr);
  }
  readByteData(addr: number, cmd: number) {
    this.check(addr);
    return this.host.readByteData(addr, cmd);
  }
  writeByteData(addr: number, cmd: number, value: number) {
    this.check(addr);
    this.host.writeByteData(addr, cmd, value);
  }
  writeWordData(addr: number, cmd: number, value: number) {
    this.check(addr);
    this.host.writeWordData(addr, cmd, value);
  }
  writeBlockData(addr: number, cmd: number, data: ArrayLike<number>) {
    this.check(addr);
    this.host.writeBlockData(addr, cmd, data);
  }
  close() {
    this.host.close();
  }
}
