"""Print a coarse loudness envelope (dBFS per step) of audio files, plus a spectral centroid.
Usage: envelope.py STEP_SECONDS file [file ...]"""
import array
import math
import subprocess
import sys

step = float(sys.argv[1])
SR = 16000
for path in sys.argv[2:]:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                         capture_output=True).stdout
    a = array.array('h', raw)
    n = int(SR * step)
    line = []
    peak = 0
    for i in range(0, len(a), n):
        seg = a[i:i + n]
        if not seg:
            break
        rms = math.sqrt(sum(x * x for x in seg) / len(seg)) / 32768
        peak = max(peak, max(abs(x) for x in seg) / 32768)
        db = 20 * math.log10(rms + 1e-9)
        line.append(' .:-=+*#%@'[max(0, min(9, int((db + 60) / 6)))])
    # Zero-crossing rate as a rough brightness hint.
    zc = sum(1 for i in range(1, len(a)) if (a[i - 1] < 0) != (a[i] < 0)) / max(1, len(a)) * SR / 2
    print(f'{path.rsplit("/", 1)[-1]:28} {len(a) / SR:5.1f}s peak {20 * math.log10(peak + 1e-9):5.1f}dB zcr~{zc:5.0f}Hz')
    s = ''.join(line)
    for k in range(0, len(s), 100):
        print(f'  {k * step:5.1f} |{s[k:k + 100]}|')
