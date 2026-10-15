// Phaser 2D entry: splash first, the game only loads after Start.
import { showSplash } from './ui/splash.js';
import { unlockAudioSoon } from './ui/unlock.js';

showSplash({ version: '2d', load: () => import('./main.js') }).then(unlockAudioSoon);
