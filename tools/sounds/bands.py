"""Energy per frequency band, in dB relative to the whole signal. Spots harsh 2-5 kHz energy.
Usage: bands.py [-ss START -t DUR] file [file ...]"""
import array
import math
import subprocess
import sys

BANDS = [('<150', 'lowpass=f=150'), ('150-500', 'highpass=f=150,lowpass=f=500'),
         ('0.5-2k', 'highpass=f=500,lowpass=f=2000'), ('2-5k', 'highpass=f=2000,lowpass=f=5000'),
         ('>5k', 'highpass=f=5000')]
args = sys.argv[1:]
seek = []
while args and args[0] in ('-ss', '-t'):
    seek += args[:2]
    args = args[2:]


def rms(path, af=None):
    cmd = ['ffmpeg', '-v', 'error'] + seek + ['-i', path, '-ac', '1', '-ar', '22050']
    if af:
        cmd += ['-af', af]
    a = array.array('h', subprocess.run(cmd + ['-f', 's16le', '-'], capture_output=True).stdout)
    return math.sqrt(sum(x * x for x in a[::3]) / max(1, len(a) // 3)) + 1e-9


for p in args:
    full = rms(p)
    cols = '  '.join(f'{n} {20 * math.log10(rms(p, af) / full):6.1f}' for n, af in BANDS)
    print(f'{p.rsplit("/", 1)[-1][:26]:26} total {20 * math.log10(full / 32768):6.1f}dB | {cols}')
