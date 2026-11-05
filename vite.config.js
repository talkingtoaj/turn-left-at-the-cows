import { resolve } from 'path';
import { defineConfig } from 'vite';

// Pages: index.html (Phaser 2D), three.html (three.js 3D) and
// sounds.html (dev review page for every sound file).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        phaser: resolve(__dirname, 'index.html'),
        three: resolve(__dirname, 'three.html'),
        sounds: resolve(__dirname, 'sounds.html'),
      },
    },
  },
});
