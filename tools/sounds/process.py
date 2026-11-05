"""Turn raw downloads into game-ready mono mp3s in public/sounds/.
Usage: process.py RAW_FS_DIR RAW_EL_DIR
One-shots: trim, short fades, peak-normalise to -1 dBFS.
Loops: trim, crossfade the tail into the head so the loop is seamless, RMS-normalise, limit peaks."""
import array
import math
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'public', 'sounds')
SR = 44100

FS, EL = sys.argv[1], sys.argv[2]

# name, source, start, duration (None = to end), kind, extra ffmpeg filter, target (dBFS: RMS for loops, peak for one-shots)
RECIPES = [
    ('engine/idle', f'{EL}/engine_idle.mp3', 0, None, 'loop', '', -18),
    ('engine/mid', f'{EL}/engine_mid.mp3', 0, None, 'loop', '', -18),
    ('engine/high', f'{EL}/engine_high.mp3', 0, None, 'loop', 'lowpass=f=7000', -18),
    ('engine/reverse', f'{FS}/369055.ogg', 4, 6, 'loop', 'highpass=f=40', -18),
    ('tyres/gravel', f'{FS}/251661.ogg', 1, 10, 'loop', 'highpass=f=60', -20),
    ('tyres/paved', f'{EL}/tyre_paved.mp3', 0, None, 'loop', '', -20),
    ('tyres/grass', f'{EL}/tyre_grass.mp3', 0, None, 'loop', '', -20),
    ('nature/creek', f'{FS}/231536.ogg', 2, 12, 'loop', '', -20),
    ('nature/river', f'{FS}/420557.ogg', 5, 12, 'loop', '', -20),
    ('nature/birdsong', f'{FS}/490845.ogg', 2, 15, 'loop', 'highpass=f=300', -22),
    ('nature/bird1', f'{FS}/517736.ogg', 0.8, 1.9, 'oneshot', 'highpass=f=400', -1),
    ('nature/bird2', f'{FS}/507255.ogg', 0.1, 2.7, 'oneshot', 'highpass=f=400', -1),
    ('nature/bird3', f'{FS}/695297.ogg', 0, None, 'oneshot', 'highpass=f=400', -1),
    ('nature/bird4', f'{FS}/851731.ogg', 0, 3.6, 'oneshot', 'highpass=f=400', -1),
    ('town/murmur', f'{FS}/634880.ogg', 3, 18, 'loop', 'highpass=f=80', -20),
    ('animals/cow1', f'{FS}/700378.ogg', 0, None, 'oneshot', '', -1),
    ('animals/cow2', f'{FS}/700379.ogg', 0, None, 'oneshot', '', -1),
    ('animals/cow3', f'{FS}/700380.ogg', 0, None, 'oneshot', '', -1),
    ('animals/dog1', f'{FS}/277058.ogg', 0, None, 'oneshot', '', -1),
    ('animals/dog2', f'{FS}/625497.ogg', 0, None, 'oneshot', '', -1),
    ('animals/dog3', f'{FS}/625496.ogg', 0, None, 'oneshot', '', -1),
    ('animals/horse1', f'{FS}/347036.ogg', 0.2, 7.3, 'oneshot', '', -1),
    ('animals/horse2', f'{FS}/269571.ogg', 0, None, 'oneshot', '', -1),
    ('bell/bell', f'{FS}/633208.ogg', 0, None, 'oneshot', '', -1),
    ('voices/m1', f'{EL}/voice_m1.mp3', 0, None, 'loop', 'highpass=f=70', -20),
    ('voices/m2', f'{EL}/voice_m2.mp3', 0, None, 'loop', 'highpass=f=70', -20),
    ('voices/m3', f'{EL}/voice_m3.mp3', 0, None, 'loop', 'highpass=f=70', -20),
    ('voices/f1', f'{EL}/voice_f1.mp3', 0, None, 'loop', 'highpass=f=90', -20),
    ('voices/f2', f'{EL}/voice_f2.mp3', 0, None, 'loop', 'highpass=f=90', -20),
    ('voices/f3', f'{EL}/voice_f3.mp3', 0, None, 'loop', 'highpass=f=90', -20),
    ('damage/flat_tyre', f'{EL}/flat_tyre.mp3', 0, None, 'loop', '', -18),
    ('damage/crash', f'{EL}/crash_thud.mp3', 0, None, 'oneshot', '', -1),
]


def decode(src, start, dur, extra):
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(start)]
    if dur:
        cmd += ['-t', str(dur)]
    cmd += ['-i', src, '-ac', '1', '-ar', str(SR)]
    if extra:
        cmd += ['-af', extra]
    cmd += ['-f', 'f32le', '-']
    return list(array.array('f', subprocess.run(cmd, capture_output=True, check=True).stdout))


def rms(a):
    return math.sqrt(sum(x * x for x in a) / max(1, len(a)))


def make_loop(a, fade_s=0.35):
    f = min(int(SR * fade_s), len(a) // 4)
    body = a[:len(a) - f]
    tail = a[len(a) - f:]
    for i in range(f):
        # Equal-power crossfade: the tail fades out over the head fading in.
        t = (i + 0.5) / f
        body[i] = body[i] * math.sin(t * math.pi / 2) + tail[i] * math.cos(t * math.pi / 2)
    return body


def trim_silence(a, thr=0.003):
    s = 0
    while s < len(a) and abs(a[s]) < thr:
        s += 1
    e = len(a)
    while e > s and abs(a[e - 1]) < thr:
        e -= 1
    return a[max(0, s - int(SR * 0.005)):min(len(a), e + int(SR * 0.02))]


def fades(a, fin=0.005, fout=0.08):
    n_in = int(SR * fin)
    n_out = min(int(SR * fout), len(a) // 3)
    for i in range(n_in):
        a[i] *= i / n_in
    for i in range(n_out):
        a[len(a) - 1 - i] *= i / n_out
    return a


def soft_limit(a, ceiling):
    # tanh knee above 70% of the ceiling keeps loud peaks from clipping.
    k = 0.7 * ceiling
    out = []
    for x in a:
        ax = abs(x)
        if ax > k:
            ax = k + (ceiling - k) * math.tanh((ax - k) / (ceiling - k))
            x = ax if x > 0 else -ax
        out.append(x)
    return out


def main():
    for name, src, start, dur, kind, extra, target in RECIPES:
        a = decode(src, start, dur, extra)
        if kind == 'loop':
            a = make_loop(a)
            g = 10 ** (target / 20) / (rms(a) or 1)
            a = soft_limit([x * g for x in a], 10 ** (-1 / 20))
        else:
            a = fades(trim_silence(a), fout=0.4 if name == 'bell/bell' else 0.06)
            g = 10 ** (target / 20) / (max(abs(x) for x in a) or 1)
            a = [x * g for x in a]
        dst = os.path.join(OUT, name + '.mp3')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        pcm = array.array('f', a).tobytes()
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                        '-c:a', 'libmp3lame', '-b:a', '64k', dst], input=pcm, check=True)
        print(f'{name:20} {kind:8} {len(a) / SR:5.2f}s {os.path.getsize(dst) // 1024:4d} KB')


main()
