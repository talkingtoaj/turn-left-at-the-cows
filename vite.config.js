import { resolve } from 'path';
import { defineConfig } from 'vite';

// Pages: index.html (the game, three.js), three.html (the same game, kept so
// old /three.html links still work) and sounds.html (dev review page for
// every sound file). The 2D Phaser version was dropped in Nov 2026.
// %SITE_URL% in the pages (canonical, Open Graph and Twitter image links):
// set SITE_URL=https://example.com at build time for absolute links. Left
// unset, the links are site-relative ("/", "/og.jpg").
const siteUrl = () => ({
  name: 'site-url',
  transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', (process.env.SITE_URL || '').replace(/\/$/, '')),
});

export default defineConfig({
  plugins: [siteUrl()],
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
