"""Print ElevenLabs plan and credit usage (no key printed)."""
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from keys import key

req = urllib.request.Request('https://api.elevenlabs.io/v1/user/subscription',
                             headers={'xi-api-key': key('ELEVENLABS_API_KEY')})
d = json.load(urllib.request.urlopen(req))
keep = ['tier', 'character_count', 'character_limit', 'next_character_count_reset_unix', 'currency',
        'status', 'billing_period', 'character_refresh_period', 'next_invoice',
        'can_extend_character_limit', 'max_character_limit_extension', 'max_credit_limit_extension']
print(json.dumps({k: d.get(k) for k in keep}, indent=1))
