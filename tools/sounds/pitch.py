"""Rough fundamental estimate per second (autocorrelation, 40-400 Hz), plus low/high band energy split.
Usage: pitch.py file [file ...]"""
import array
import math
import subprocess
import sys

SR = 4000
for path in sys.argv[1:]:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-af', 'lowpass=f=1500',
                          '-ar', str(SR), '-f', 's16le', '-'], capture_output=True).stdout
    a = array.array('h', raw)
    out = []
    for s in range(0, len(a) - SR, SR):
        seg = a[s:s + SR // 2]
        e = sum(x * x for x in seg) or 1
        best, bl = 0, 0
        for lag in range(SR // 400, SR // 40):
            c = sum(seg[i] * seg[i + lag] for i in range(0, len(seg) - lag, 2)) * 2 / e
            if c > best:
                best, bl = c, lag
        out.append(f'{SR / bl:.0f}Hz({best:.2f})' if bl else '-')
    print(path.rsplit('/', 1)[-1], ' '.join(out))
