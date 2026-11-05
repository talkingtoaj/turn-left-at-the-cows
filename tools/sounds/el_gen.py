"""Generate one sound with the ElevenLabs Sound Effects API.
Usage: el_gen.py OUT_FILE.mp3 DURATION LOOP(0/1) "prompt"
Every call is appended to el_log.jsonl (prompt, cost header, size). Refuses past the call cap."""
import json
import os
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from keys import key

CAP = 25
LOG = os.path.join(HERE, 'el_log.jsonl')

out, dur, loop, prompt = sys.argv[1], float(sys.argv[2]), sys.argv[3] == '1', sys.argv[4]
calls = 0
if os.path.exists(LOG):
    with open(LOG) as f:
        calls = sum(1 for _ in f)
if calls >= CAP:
    raise SystemExit(f'call cap reached ({calls}/{CAP})')

body = {'text': prompt, 'duration_seconds': dur, 'prompt_influence': 0.5,
        'model_id': 'eleven_text_to_sound_v2', 'loop': loop}
req = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',
                             data=json.dumps(body).encode(), method='POST',
                             headers={'xi-api-key': key('ELEVENLABS_API_KEY'), 'Content-Type': 'application/json'})
entry = {'t': time.strftime('%Y-%m-%d %H:%M:%S'), 'out': os.path.basename(out), 'duration': dur,
         'loop': loop, 'prompt': prompt}
try:
    r = urllib.request.urlopen(req, timeout=180)
    data = r.read()
    entry['cost'] = r.headers.get('character-cost') or r.headers.get('x-character-count')
    entry['headers'] = {k: v for k, v in r.headers.items() if 'cost' in k.lower() or 'character' in k.lower()}
    entry['bytes'] = len(data)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'wb') as f:
        f.write(data)
except urllib.error.HTTPError as e:
    entry['error'] = f'{e.code} {e.read()[:300]!r}'
with open(LOG, 'a') as f:
    f.write(json.dumps(entry) + '\n')
print(json.dumps(entry))
print(f'calls used {calls + 1}/{CAP}')
