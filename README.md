# Bloom

**Design your own custom RGB lighting for Windows.** Layer effects, build gradients, shape how colors move, save your looks as presets and share them, all from a live, motion-rich dashboard that shows your whole PC glowing in real time.

> **Powered by [OpenRGB](https://openrgb.org).** Bloom ships the official, unmodified OpenRGB build and uses it in the background to reach the hundreds of RGB devices it supports. Bloom also has its own drivers for a few devices. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Install

1. Download **`Bloom-Setup-x.y.z.exe`** from the [latest release](../../releases/latest) and run it.
2. Windows may say *"Windows protected your PC"*, because Bloom isn't code-signed. Click **More info → Run anyway**.
3. Approve the admin prompt. This is the only one: the installer sets up Bloom's lighting service to start at sign-in with the rights RAM lighting needs.
4. Close other RGB apps (SignalRGB, iCUE, Armoury Crate, RGB Fusion…). Bloom warns you if one is running.
5. **For RAM lighting:** install the free [PawnIO](https://pawnio.eu) driver, then restart.

Bloom opens to a short welcome, then lives in your tray. To uninstall, use *Settings → Apps*. Your saved looks stay in `%APPDATA%\Bloom` unless you delete that folder.

## What hardware works

Bloom talks to your lights two ways:

1. **Its own drivers** for a few devices, written from scratch and tested on real hardware:

   | Hardware | Interface | Driver |
   |---|---|---|
   | ASRock Polychrome USB boards (ARGB fan headers, 12V headers, board accent), e.g. B560M-C | USB HID `26CE:01A2` | [`asrock-polychrome.ts`](server/devices/asrock-polychrome.ts) |
   | ENE-based DDR4 RGB RAM, e.g. G.Skill Trident Z RGB (`DIMM_LED-0103`) | Intel PCH SMBus via [PawnIO](https://pawnio.eu) | [`ene-ram.ts`](server/devices/ene-ram.ts) |
   | GIGABYTE RTX 3060 Gaming OC logo (RGB Fusion 2, I2C `0x32`) | GPU I2C bus via NVIDIA's NvAPI | [`gigabyte-gpu.ts`](server/devices/gigabyte-gpu.ts) |

2. **OpenRGB** for everything else it recognizes: motherboards, RAM, graphics cards, fan hubs, LED strips, keyboards, mice, headsets and more. Those devices appear in Bloom like any other zone, marked *via OpenRGB*. Bloom switches off OpenRGB's detection for the devices it drives itself, so the two never fight over the same hardware.

Devices neither one knows yet won't light up. If yours doesn't show up, please open an issue with its make and model.

**Known issue:** OpenRGB's own ASRock Polychrome USB driver can make ARGB fans flicker. Bloom always uses its built-in ASRock driver for those boards instead, so this only matters if you turn Bloom's own drivers off (`BLOOM_NATIVE=0`).

## How it works

A local Node service owns the hardware and runs a 30 fps effect engine. A React control panel talks to it over a WebSocket and shows a live preview of every LED.

## Highlights

- **One effect engine, two consumers.** Effects are pure functions of `(time, LED position) → color` in [`shared/effects.ts`](shared/effects.ts). The server runs them for the hardware, and the UI runs the *same code* for the animated effect thumbnails.
- **Layered effect editor.** Each effect is a *field* that returns a gradient position and a brightness. A shared pipeline then applies gradient palettes (up to 12 stops), motion curves (smooth, linear, pulse, hard, saw), contrast, brightness range, hue drift and per-device offset. Up to 6 layers stack with Normal, Add, Screen or Multiply blending.
- **Presets.** 11 built-ins (including a hidden-in-plain-sight developer favorite), plus your own: save, update, rename, delete, and import/export as JSON. Imported files are validated by the same sanitizer the server uses ([`shared/stack.ts`](shared/stack.ts)), and settings from earlier versions (including the project's old name, Lumen) are migrated automatically.
- **Spatial effects.** Every LED gets a position in a virtual case ([`shared/layout.ts`](shared/layout.ts)), so waves, ripples and aurora flow across fans *and* RAM as one scene instead of looping per device.
- **Live preview, not a mock-up.** The stage canvas draws the exact bytes being sent to the hardware, streamed as compact binary frames.
- **SMBus safety guard.** RAM lighting shares a bus with the DIMMs' SPD EEPROMs. Every SMBus transaction goes through an allow-list ([`smbus.ts`](server/smbus/smbus.ts)) that hard-refuses the SPD ranges, and the system-wide `Access_SMBUS.HTP.Method` mutex is held so Bloom never collides with hardware monitors like HWiNFO.
- **Demo mode.** `npm run demo` simulates the full rig, so the UI runs on any machine.
- **OpenRGB SDK client.** A small, dependency-free client for OpenRGB's network protocol ([`server/openrgb/client.ts`](server/openrgb/client.ts)) maps OpenRGB devices, including keyboard matrix layouts, onto Bloom zones.
- **No build step for the server.** Node ≥ 23.6 runs the TypeScript directly (type stripping).

## Build from source

**Make the installer:** `npm install`, run `scripts/fetch-openrgb.ps1` once, then `npm run dist`. The installer lands in `dist-installer/`. The app is Electron: the same `Bloom.exe` runs as the background lighting service (`--service`, started at sign-in by the *Bloom RGB* scheduled task) or as the window and tray icon, which talks to the service on `localhost:7420`.

## Run it (development)

```bash
npm install
powershell -File scripts/fetch-openrgb.ps1   # adds OpenRGB (wider device support)
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

RAM is controlled over SMBus, which Windows only exposes to kernel drivers. Bloom uses **PawnIO**, a signed driver that runs small, sandboxed modules (the same approach OpenRGB and LibreHardwareMonitor use):

1. Install PawnIO from https://pawnio.eu.
2. Put `SmbusI801.bin` (from the [PawnIO.Modules releases](https://github.com/namazso/PawnIO.Modules/releases)) in `server/smbus/modules/`.
3. Start Bloom as **administrator**. Double-clicking `start-bloom.cmd` does this for you and opens the panel.

### Desktop shortcut

`scripts/install-shortcut.ps1` adds a **Bloom** shortcut (with the Bloom icon) to the desktop and Start menu. It opens the control panel in its own app window, with no tabs or address bar, and starts the Bloom service first if it isn't running.

### Start at sign-in

`scripts/install-autostart.ps1` (run in an admin PowerShell) registers a **Bloom RGB** scheduled task. It starts Bloom hidden, with admin rights, 10 seconds after you sign in, and restarts it if it crashes. The log goes to `%LOCALAPPDATA%\Bloom\bloom.log`. `scripts/uninstall-autostart.ps1` removes the task. With the task running, `start-bloom.cmd` just opens the panel.

If every SMBus transfer times out, another driver has left the controller's hardware "in use" flag set. This happens when an RGB app is force-closed mid-transfer. Disable that app at startup and reboot. `node scripts/smbus-diag.ts` (run as admin) shows the raw result codes and only performs reads.

**Gigabyte GPU (I2C over NvAPI).** `nvapi64.dll` exports only `nvapi_QueryInterface(id)`, which returns each function's address. Bloom calls `NvAPI_I2CWriteEx`/`ReadEx` through those addresses with an `NV_I2C_INFO_V3` (64 bytes, address shifted left by 1, port 1). The controller takes 8-byte raw writes: `AB` is a handshake (it replies `AB 10 00 01`), `88 01 06 63 08 <zone>` sets static mode, and `40 R G B <zone>` sets the color.

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
