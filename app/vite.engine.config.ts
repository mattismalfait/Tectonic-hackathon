// Bundles the scoring engine (src/engine) into one browser script for the clickable prototype:
// prototype/engine.bundle.js exposes it as window.SDEngine. Run: npm run build:prototype
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: { entry: 'src/engine/index.ts', name: 'SDEngine', formats: ['iife'], fileName: () => 'engine.bundle.js' },
    outDir: '../prototype',
    emptyOutDir: false,
    minify: false,
    copyPublicDir: false,
  },
})
