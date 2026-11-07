// Game entry: splash first, the game only loads after Start (or Continue).
// Dev: ?reset=progress forgets the saved progress (src/game/progress.js);
// ?mission=<id> makes that mission the one Start plays.
import { showSplash } from '../src/ui/splash.js';
import { unlockAudioSoon } from '../src/ui/unlock.js';
import { clearProgress } from '../src/game/progress.js';
import { missionIndexById } from '../src/game/missionList.js';

const params = new URLSearchParams(window.location.search);
if (params.get('reset') === 'progress') clearProgress();
const asked = params.has('mission') ? missionIndexById(params.get('mission')) : -1;

showSplash({
  version: '3d',
  preferred: asked >= 0 ? asked : null,
  load: async (index) => {
    const game = await import('./main.js');
    await game.startGame(index);
  },
}).then(unlockAudioSoon);
