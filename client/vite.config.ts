import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: { alias: { '@rules': fileURLToPath(new URL('../shared/rules/index.ts', import.meta.url)) } },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        gallery: fileURLToPath(new URL('./vfx-gallery.html', import.meta.url)),
        wiki: fileURLToPath(new URL('./wiki/index.html', import.meta.url)),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'vendor-three';
          if (id.includes('node_modules/@react-three/') || id.includes('node_modules/postprocessing/') || id.includes('node_modules/three-mesh-bvh/')) return 'vendor-r3f';
          if (id.includes('node_modules/@supabase/')) return 'vendor-supabase';
        },
      },
    },
    outDir: fileURLToPath(new URL('../dist', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
  },
  server: { host: true },
});
