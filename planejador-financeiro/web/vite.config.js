import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
  server: { proxy: { '/api': 'http://localhost:8787' }, fs: { allow: ['..'] } },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false },
});
