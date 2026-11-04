# Lumen

A lightweight RGB lighting controller for my PC. It's a from-scratch alternative to SignalRGB, built around the hardware I actually own:

| Hardware | Interface | Driver |
|---|---|---|
| ASRock B560M-C Polychrome (2× ARGB fan headers, 2× 12V headers, board accent) | USB HID `26CE:01A2` | [`asrock-polychrome.ts`](server/devices/asrock-polychrome.ts) |
| G.Skill Trident Z RGB DDR4 (ENE `DIMM_LED-0103` controller per stick) | Intel PCH SMBus via [PawnIO](https://pawnio.eu) | [`ene-ram.ts`](server/devices/ene-ram.ts) |
| GIGABYTE RTX 3060 Gaming OC logo (RGB Fusion 2, I2C `0x32`) | GPU I2C bus via NVIDIA's NvAPI | [`gigabyte-gpu.ts`](server/devices/gigabyte-gpu.ts) |

A local Node service owns the hardware and runs a 30 fps effect engine. A React control panel talks to it over a WebSocket and shows a live preview of every LED.

## Highlights

- **One effect engine, two consumers.** Effects are pure functions of `(time, LED position) → color` in [`shared/effects.ts`](shared/effects.ts). The server runs them for the hardware, and the UI runs the *same code* for the animated effect thumbnails.
- **Spatial effects.** Every LED gets a position in a virtual case ([`shared/layout.ts`](shared/layout.ts)), so waves, ripples and aurora flow across fans *and* RAM as one scene instead of looping per device.
- **Live preview, not a mock-up.** The stage canvas draws the exact bytes being sent to the hardware, streamed as compact binary frames.
- **SMBus safety guard.** RAM lighting shares a bus with the DIMMs' SPD EEPROMs. Every SMBus transaction goes through an allow-list ([`smbus.ts`](server/smbus/smbus.ts)) that hard-refuses the SPD ranges, and the system-wide `Access_SMBUS.HTP.Method` mutex is held so Lumen never collides with hardware monitors like HWiNFO.
- **Demo mode.** `npm run demo` simulates the full rig, so the UI runs on any machine.
- **No build step for the server.** Node ≥ 23.6 runs the TypeScript directly (type stripping).

## Run it

```bash
npm install
npm run build      # build the control panel
npm start          # http://localhost:7420
```

Quit SignalRGB, Polychrome Sync or OpenRGB first. Only one app can drive the lights at a time.

Try it without the hardware:

```bash
npm run demo
```

UI development with hot reload: run `npm start` (or `npm run demo`) in one terminal and `npm run dev:web` in another, then open http://localhost:5173.

### Enabling RAM lighting

RAM is controlled over SMBus, which Windows only exposes to kernel drivers. Lumen uses **PawnIO**, a signed driver that runs small, sandboxed modules (the same approach OpenRGB and LibreHardwareMonitor use):

1. Install PawnIO from https://pawnio.eu.
2. Put `SmbusI801.bin` (from the [PawnIO.Modules releases](https://github.com/namazso/PawnIO.Modules/releases)) in `server/smbus/modules/`.
3. Start Lumen as **administrator**. Double-clicking `start-lumen.cmd` does this for you and opens the panel.

### Start at sign-in

`scripts/install-autostart.ps1` (run in an admin PowerShell) registers a **Lumen RGB** scheduled task. It starts Lumen hidden, with admin rights, 10 seconds after you sign in, and restarts it if it crashes. The log goes to `%LOCALAPPDATA%\Lumen\lumen.log`. `scripts/uninstall-autostart.ps1` removes the task. With the task running, `start-lumen.cmd` just opens the panel.

If every SMBus transfer times out, another driver has left the controller's hardware "in use" flag set. This happens when an RGB app is force-closed mid-transfer. Disable that app at startup and reboot. `node scripts/smbus-diag.ts` (run as admin) shows the raw result codes and only performs reads.

**Gigabyte GPU (I2C over NvAPI).** `nvapi64.dll` exports only `nvapi_QueryInterface(id)`, which returns each function's address. Lumen calls `NvAPI_I2CWriteEx`/`ReadEx` through those addresses with an `NV_I2C_INFO_V3` (64 bytes, address shifted left by 1, port 1). The controller takes 8-byte raw writes: `AB` is a handshake (it replies `AB 10 00 01`), `88 01 06 63 08 <zone>` sets static mode, and `40 R G B <zone>` sets the color.

## Project layout

```
shared/    effect library, LED layout, color math, wire types (used by server + UI)
server/    hardware drivers, SMBus/PawnIO bindings, render engine, HTTP + WebSocket
web/       React control panel (Vite)
```

## Protocol notes

**ASRock Polychrome (USB).** This uses 64-byte HID reports. `14 00 <id>` reads config: id 1 is a zone-enable bitmask, id 2 is the per-zone LED counts. Per-LED colors are streamed as one `10 00 FF E3` packet followed by 15 `10 00 FF E4` packets, in zone order: 12V headers, ARGB 1, ARGB 2, board zones, ARGB 3. ARGB headers are only addressable per LED when the firmware reports 80 LEDs on them.

**ENE RAM (SMBus).** Register access is indirect. You write the 16-bit register as a byte-swapped SMBus word to command `0x00`, then read `0x81`, write a byte to `0x01`, or write a block to `0x03`. All sticks boot on address `0x77`, and each is moved to a free address via registers `0x80F8`/`0x80F9`. Colors are R-B-G, written to `0x8000+` with direct mode (`0x8020 = 1`) enabled.

Protocol knowledge comes from reading SignalRGB's installed plugins and OpenRGB's source. The implementations here are my own.
