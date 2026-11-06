# Third-party software

## OpenRGB

Bloom uses **OpenRGB** to support RGB hardware that Bloom doesn't drive itself.

- **Project:** OpenRGB, by Adam Honse and the OpenRGB contributors: https://openrgb.org
- **Version used:** 1.1 (Windows 64-bit), unmodified, from the official release
  `OpenRGB_1.1_Windows_64_8e16de2.zip`
  (SHA-256 `63291726C6FC84EB479EF2EE752E97E1187F6CE9C49FD27EEE40DED588A8172A`)
- **License:** GNU General Public License, version 2 or (at your option) any later version.
  The full text ships with OpenRGB as `vendor/openrgb/LICENSE.txt`.
- **Source code:** the complete source for this exact version is available at
  https://codeberg.org/OpenRGB/OpenRGB/src/tag/release_1.1 (mirror: https://gitlab.com/CalcProgrammer1/OpenRGB).

**How Bloom uses it:** Bloom ships OpenRGB as a separate, unmodified program. Bloom starts it in the background and talks to it only through OpenRGB's public SDK network protocol on `localhost`. Bloom contains no OpenRGB source code. You are free to use, study, change and share OpenRGB under the terms of its license.

The OpenRGB download also includes components with their own licenses (for example Qt, hidapi, libusb and the PawnIO library and SMBus modules). See https://openrgb.org for details.

## PawnIO

Bloom's own RAM driver uses the **PawnIO** driver (https://pawnio.eu) and its `SmbusI801` module (https://github.com/namazso/PawnIO.Modules, LGPL-2.1-or-later). PawnIO is installed separately by the user, and the module is downloaded by the user from its official releases. Neither is included in Bloom's repository.
