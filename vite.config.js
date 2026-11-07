import { resolve } from 'path';
import { defineConfig } from 'vite';

// Pages: index.html (the game, three.js), three.html (the same game, kept so
// old /three.html links still work) and sounds.html (dev review page for
// every sound file). The 2D Phaser version was dropped in Nov 2026.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        three: resolve(__dirname, 'three.html'),
        sounds: resolve(__dirname, 'sounds.html'),
      },
    },
  },
});
