// three.js 3D entry: splash first, the game only loads after Start.
import { showSplash } from '../src/ui/splash.js';
import { unlockAudioSoon } from '../src/ui/unlock.js';

showSplash({ version: '3d', load: () => import('./main.js') }).then(unlockAudioSoon);
