// Where Bloom's files live. Works three ways:
//  - developing:      server/*.ts run directly → root is the project folder
//  - bundled:         build/server.mjs        → root is the folder above build/
//  - installed app:   Electron sets BLOOM_ROOT / BLOOM_OPENRGB_DIR to its own folders

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = process.env.BLOOM_ROOT ?? path.resolve(here, '..');
export const WEB_DIST = path.join(ROOT, 'web', 'dist');
export const OPENRGB_DIR = process.env.BLOOM_OPENRGB_DIR ?? path.join(ROOT, 'vendor', 'openrgb');

/** Places to look for PawnIO's SmbusI801 module (OpenRGB ships the same official file). */
export const SMBUS_MODULE_CANDIDATES = [
  process.env.BLOOM_SMBUS_MODULE,
  path.join(ROOT, 'server', 'smbus', 'modules', 'SmbusI801.bin'),
  path.join(OPENRGB_DIR, 'SmbusI801.bin'),
].filter((p): p is string => !!p);
