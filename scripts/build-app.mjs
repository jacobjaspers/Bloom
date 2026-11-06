// Bundles the Bloom server and the Electron app shell into build/ for packaging.
// Native modules (node-hid, koffi) stay external; electron-builder ships them as-is.

import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: 'linked',
  logLevel: 'info',
  external: ['electron', 'node-hid', 'koffi', 'bufferutil', 'utf-8-validate'],
  // Some bundled CommonJS packages call require(); give the ESM bundle one.
  banner: { js: "import { createRequire as __bloomRequire } from 'node:module'; const require = __bloomRequire(import.meta.url);" },
};

await build({ ...common, entryPoints: ['server/main.ts'], outfile: 'build/server.mjs' });
await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'build/main.mjs', external: [...common.external, './server.mjs'] });
