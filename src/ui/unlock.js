// The audio module starts its AudioContext on the first key or pointer
// gesture it sees, but it loads after the Start click. The page already has
// user activation from that click, so poke its gesture listener once the
// game is in, and sound can start straight away.
export function unlockAudioSoon() {
  // Try a few times, in case the audio is made a frame or two after the import.
  for (const ms of [0, 300, 1000, 2500]) {
    setTimeout(() => {
      try {
        window.dispatchEvent(new Event('pointerdown'));
      } catch (e) {
        // No audio: fine.
      }
    }, ms);
  }
}
