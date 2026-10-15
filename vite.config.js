import { resolve } from 'path';
import { defineConfig } from 'vite';

// Two pages: index.html (Phaser 2D) and three.html (three.js 3D).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        phaser: resolve(__dirname, 'index.html'),
        three: resolve(__dirname, 'three.html'),
      },
    },
  },
});
