import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: { '/ws': { target: 'ws://localhost:7420', ws: true } },
  },
});
