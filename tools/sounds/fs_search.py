"""Search Freesound for CC0 sounds. Usage: fs_search.py "query" [max_duration] [n]"""
import json
import os
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keys import key

q = sys.argv[1]
maxd = float(sys.argv[2]) if len(sys.argv) > 2 else 60
n = int(sys.argv[3]) if len(sys.argv) > 3 else 12
params = {
    'query': q,
    'filter': f'license:"Creative Commons 0" duration:[0.3 TO {maxd}]',
    'fields': 'id,name,username,license,duration,avg_rating,num_ratings,num_downloads,channels,samplerate',
    'sort': 'score',
    'page_size': 40,
    'token': key('FREESOUND_API_KEY'),
}
url = 'https://freesound.org/apiv2/search/text/?' + urllib.parse.urlencode(params)
d = json.load(urllib.request.urlopen(url))
rows = d['results']
# Rank by rating weighted by number of ratings and downloads.
rows.sort(key=lambda r: -((r['avg_rating'] or 0) * min(r['num_ratings'], 30) + r['num_downloads'] / 2000))
print(q, 'total', d['count'])
for r in rows[:n]:
    print(f"{r['id']:>7} {r['duration']:6.1f}s {r['avg_rating']:.1f}x{r['num_ratings']:<3} dl{r['num_downloads']:<6} {r['username'][:16]:16} {r['name'][:60]}")
