import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'esnext', assetsInlineLimit: 0, sourcemap: true,
    rolldownOptions: { output: { manualChunks(id: string) { if (id.includes('/vendor/')) return 'vendor'; } } } },

});
