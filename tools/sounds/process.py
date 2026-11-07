"""Turn raw downloads into game-ready mono mp3s in public/sounds/.
Usage: process.py RAW_FS_DIR RAW_EL_DIR RAW_EL2_DIR [name ...]   (names limit which files are rebuilt)
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

FS, EL, EL2 = sys.argv[1], sys.argv[2], sys.argv[3]
EL3 = os.path.join(os.path.dirname(EL2), 'raw_el3')
ONLY = set(sys.argv[4:])

# Engine edge removal: lowpass plus a gentle high shelf cut.
SOFT = 'lowpass=f=2500,highshelf=f=1500:g=-6'
# Loops are RMS-normalised after filtering, so these shift the balance
# between bands rather than just the level.
LESS_BASS = ('highpass=f=85,highpass=f=85,equalizer=f=130:t=q:w=0.8:g=-4,'
             'equalizer=f=280:t=q:w=1:g=6,equalizer=f=600:t=q:w=1:g=6')
# Growl: drive into a soft clipper for harmonics, then lift the low mids.
GROWL = ('volume=14,asoftclip=type=tanh,volume=0.08,'
         'equalizer=f=550:t=q:w=1:g=7,equalizer=f=1000:t=q:w=1:g=4,'
         'lowpass=f=3000,highshelf=f=1800:g=-5')
# Bake a fixed pitch shift into a 44.1 kHz source (also shortens it).
shift = lambda k: f'asetrate={round(44100 * k)},aresample=44100'

# name, source, start, duration (None = to end), kind, extra ffmpeg filter, target (dBFS: RMS for loops, peak for one-shots)
RECIPES = [
    # Round 2 engine set: one matched gentle sedan. Mid and high get a baked
    # pitch shift so all three sit on one pitch curve (see ENGINE_LAYERS).
    # Round 3: idle gets less bass; high gets a little growl (low-mid lift,
    # light saturation, a slightly more open top).
    ('engine/idle', f'{EL2}/engine_idle.mp3', 0, None, 'loop', SOFT + ',' + LESS_BASS, -18),
    ('engine/mid', f'{EL2}/engine_mid.mp3', 0, None, 'loop', shift(1.23) + ',' + SOFT, -18),
    ('engine/high', f'{EL2}/engine_high.mp3', 0, None, 'loop', shift(1.48) + ',' + GROWL, -18),
    ('engine/reverse', f'{FS}/369055.ogg', 4, 6, 'loop', 'highpass=f=40', -18),
    ('tyres/gravel', f'{FS}/251661.ogg', 1, 10, 'loop', 'highpass=f=60', -20),
    ('tyres/paved', f'{EL}/tyre_paved.mp3', 0, None, 'loop', '', -20),
    # Round 3: the user picked this softer field loop over the first one.
    ('tyres/grass', f'{EL3}/tyre_grass.mp3', 0, None, 'loop', 'highpass=f=40,lowpass=f=6000', -20),
    # Shrub swish (one-shot): the first full swish of the FIRST grass loop
    # (raw_el/tyre_grass.mp3, rejected as a loop because the swish repeats like
    # something stuck to the tyre). Just that one swish, 0.52 to 1.14 s, before
    # the next one starts; slow fade in and a long fade out.
    ('tyres/shrub', f'{EL}/tyre_grass.mp3', 0.52, 0.62, 'oneshot', 'highpass=f=90,lowpass=f=9000', -1),
    ('nature/creek', f'{FS}/231536.ogg', 2, 12, 'loop', '', -20),
    ('nature/river', f'{FS}/420557.ogg', 5, 12, 'loop', '', -20),
    ('nature/birdsong', f'{FS}/490845.ogg', 2, 15, 'loop', 'highpass=f=300', -22),
    ('nature/bird1', f'{FS}/517736.ogg', 0.8, 1.9, 'oneshot', 'highpass=f=400', -1),
    ('nature/bird2', f'{FS}/507255.ogg', 0.1, 2.7, 'oneshot', 'highpass=f=400', -1),
    ('nature/bird3', f'{FS}/695297.ogg', 0, None, 'oneshot', 'highpass=f=400', -1),
    ('nature/bird4', f'{FS}/851731.ogg', 0, 3.6, 'oneshot', 'highpass=f=400', -1),
    ('town/murmur', f'{EL2}/town.mp3', 0, None, 'loop', 'highpass=f=80', -22),
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
    ('voices/f2', f'{EL2}/voice_f2.mp3', 0, None, 'loop', 'highpass=f=90', -20),
    ('voices/f3', f'{EL}/voice_f3.mp3', 0, None, 'loop', 'highpass=f=90', -20),
    ('damage/flat_tyre', f'{EL}/flat_tyre.mp3', 0, None, 'loop', '', -18),
    ('damage/crash', f'{EL}/crash_thud.mp3', 0, None, 'oneshot', '', -1),
    # Rough ground: stone chips on the body and heavier underbody thumps.
    ('damage/chip1', f'{FS}/868788.ogg', 0, 0.34, 'oneshot', 'highpass=f=300', -1),
    ('damage/chip2', f'{FS}/140714.ogg', 0, None, 'oneshot', 'highpass=f=300', -1),
    ('damage/chip3', f'{FS}/140718.ogg', 0, None, 'oneshot', 'highpass=f=300', -1),
    ('damage/thump1', f'{FS}/385938.ogg', 0.1, 0.6, 'oneshot', 'lowpass=f=5000', -1),
    ('damage/thump2', f'{FS}/164220.ogg', 0.15, 0.6, 'oneshot', 'lowpass=f=4000', -1),
    # Horn: one honk of a Mercury Marquis (the first of its honks).
    ('car/horn', f'{FS}/558842.ogg', 0.36, 0.72, 'oneshot', 'highpass=f=150', -3),
    # Round 8, rain: rain on the car roof (inside the car) and the wider rain
    # outside, a puddle splash two ways, and the hiss of tyres on a wet road
    # (the closest part of a wet-road pass-by, high-passed so the engine goes).
    ('weather/rain_roof', f'{FS}/535869.ogg', 2, 12, 'loop', 'highpass=f=120', -22),
    ('weather/rain', f'{FS}/595717.ogg', 0, 22, 'loop', 'highpass=f=80', -22),
    ('weather/splash1', f'{FS}/563021.ogg', 0.3, 1.9, 'oneshot', 'highpass=f=120', -1),
    ('weather/splash2', f'{FS}/207139.ogg', 3.6, 0.85, 'oneshot', 'highpass=f=150', -1),
    ('tyres/wet', f'{FS}/846301.ogg', 4.5, 4.0, 'loop', 'highpass=f=500,lowpass=f=9000', -22),
    # Round 10: the light plane's propeller drone (a seamless field loop). The
    # game pitches it with throttle and Doppler and filters it with distance.
    ('aircraft/prop', f'{FS}/789390.ogg', 0, None, 'loop', 'highpass=f=50', -18),
    # Round 11: the tow truck (src3/tow3d.js).
    ('tow/engine', f'{FS}/453415.ogg', 4, 8, 'loop', 'highpass=f=40,lowpass=f=5000', -18),
    ('tow/chain', f'{FS}/387240.ogg', 1.3, 1.8, 'oneshot', 'highpass=f=150', -3),
    ('tow/winch', f'{FS}/454148.ogg', 0, None, 'oneshot', 'highpass=f=100', -3),
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
        if ONLY and name not in ONLY:
            continue
        a = decode(src, start, dur, extra)
        if kind == 'loop':
            a = make_loop(a)
            g = 10 ** (target / 20) / (rms(a) or 1)
            a = soft_limit([x * g for x in a], 10 ** (-1 / 20))
        else:
            if name == 'tyres/shrub':
                a = fades(a, fin=0.03, fout=0.22)  # noisy floor: no silence to trim
            else:
                a = fades(trim_silence(a), fout=0.4 if name == 'bell/bell' else 0.5 if name == 'weather/splash1' else 0.06)
            g = 10 ** (target / 20) / (max(abs(x) for x in a) or 1)
            a = [x * g for x in a]
        dst = os.path.join(OUT, name + '.mp3')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        pcm = array.array('f', a).tobytes()
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                        '-c:a', 'libmp3lame', '-b:a', '64k', dst], input=pcm, check=True)
        print(f'{name:20} {kind:8} {len(a) / SR:5.2f}s {os.path.getsize(dst) // 1024:4d} KB')


main()
