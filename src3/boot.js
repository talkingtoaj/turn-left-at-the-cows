// Game entry. The start screen (src/ui/splash.js) shows at once, as plain
// DOM. As soon as it has painted, the game code, textures and sounds start
// loading and the first mission's region is built behind it
// (main.js preloadMenu), so Continue usually only has to place the car.
// When the world is ready it fades in behind the windshield, drifting
// slowly; reduced motion gets a still frame; a weak device, or no WebGL,
// keeps the painted scene. Touch-only devices (the game needs a keyboard)
// load nothing: they get the map, a note and a share button.
//
// Dev: ?reset=progress forgets the saved progress (src/game/progress.js);
// ?mission=<id> makes that mission the one Continue plays; ?menu=still /
// ?menu=painted force the still or painted backdrop.
import { showSplash } from '../src/ui/splash.js';
import { clearProgress } from '../src/game/progress.js';
import { clearIntroSeen } from '../src/ui/introCard.js';
import { missionIndexById } from '../src/game/missionList.js';
import { prefetchSounds } from '../src/audio/sounds.js';
import { keyStartMode } from './keystart.js';

const params = new URLSearchParams(window.location.search);
if (params.get('reset') === 'progress') {
  clearProgress();
  clearIntroSeen();
}
const asked = params.has('mission') ? missionIndexById(params.get('mission')) : -1;

const media = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
// A phone: touch only, no mouse or trackpad, and a small screen. Touchscreen
// laptops and 2-in-1s can report touch only too (Windows tablet mode), so a
// bigger screen always gets the normal menu.
const smallScreen = Math.min(window.screen?.width || 9999, window.screen?.height || 9999) < 600;
const touchOnly = media('(pointer: coarse)') && !media('(any-pointer: fine)') && smallScreen;
const reducedMotion = media('(prefers-reduced-motion: reduce)');
const conn = navigator.connection || {};
const weak = params.get('menu') === 'painted'
  || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 2)
  || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2)
  || !!conn.saveData;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch (e) {
    return false;
  }
}

// Load the game module once; every caller shares the promise.
let gameP = null;
const game = () => (gameP ||= import('./main.js'));

// Turn the key to start (SPEC 9s, #91). ?keystart=off keeps the plain start.
const keystart = keyStartMode({ flag: params.get('keystart'), reducedMotion, weak, phone: touchOnly });

document.body.classList.add('menu-open');
const splash = showSplash({
  version: '3d',
  preferred: asked >= 0 ? asked : null,
  phone: touchOnly,
  keystart,
  load: async (index, ks) => {
    const g = await game();
    await g.startGame(index, ks ? { ...ks, fly: keystart === 'fly' } : undefined);
  },
});

// Caveat for the in-game map's canvas text (canvas does not fetch fonts itself).
document.fonts?.load?.('22px Caveat').catch(() => {});

if (!touchOnly) {
  // After the menu's first paint, so loading never delays it.
  requestAnimationFrame(() => setTimeout(() => {
    const gl = hasWebGL();
    if (!gl) {
      console.info('[menu] no WebGL: keeping the painted backdrop');
      return;
    }
    game()
      .then((g) => g.preloadMenu(splash.first, {
        live: !weak,
        still: reducedMotion || params.get('menu') === 'still',
        rect: () => splash.windshieldRect(),
        onReady: () => splash.showWorld(),
      }))
      // Sounds last, so they never slow the code and textures down.
      .then(() => prefetchSounds())
      .catch((e) => console.warn('[menu] the game could not load behind the menu', e));
  }, 0));
}
