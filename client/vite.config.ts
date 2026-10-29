import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: { alias: { '@rules': fileURLToPath(new URL('../shared/rules/index.ts', import.meta.url)) } },
  build: { rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), gallery: fileURLToPath(new URL('./vfx-gallery.html', import.meta.url)) } }, outDir: fileURLToPath(new URL('../dist', import.meta.url)), emptyOutDir: true, chunkSizeWarningLimit: 1600 },
  server: { host: true },
});
