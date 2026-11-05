"""Download Freesound HQ previews (CC0 checked) plus metadata.
Usage: fs_get.py OUT_DIR id [id ...]   writes OUT_DIR/<id>.ogg and OUT_DIR/<id>.json"""
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keys import key

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
tok = key('FREESOUND_API_KEY')
for sid in sys.argv[2:]:
    url = f'https://freesound.org/apiv2/sounds/{sid}/?fields=id,name,username,license,url,duration,previews,description&token={tok}'
    m = json.load(urllib.request.urlopen(url))
    if 'publicdomain/zero' not in m['license']:
        print('SKIP not CC0', sid, m['license'])
        continue
    dst = os.path.join(out, f'{sid}.ogg')
    if not os.path.exists(dst):
        urllib.request.urlretrieve(m['previews']['preview-hq-ogg'], dst)
    meta = {k: m[k] for k in ['id', 'name', 'username', 'license', 'url', 'duration']}
    with open(os.path.join(out, f'{sid}.json'), 'w') as f:
        json.dump(meta, f)
    print(sid, m['duration'], m['username'], m['name'], '::', m.get('description', '')[:300].replace('\n', ' '))
