"""A basic profanity filter for nicknames and map labels.

Not clever, on purpose: it lowercases, undoes common letter swaps (0 -> o,
1 -> i, 3 -> e, 4 -> a, 5 -> s, $ -> s, @ -> a) and looks for a short list of
words. Whole words for the short, easily-innocent ones (so "Scunthorpe" and
"class" are fine); anywhere in the text for the long, unambiguous ones.
Reports catch whatever slips through.
"""

from __future__ import annotations

import re

_SWAPS = str.maketrans({"0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "+": "t"})

# Matched anywhere (after squashing spaces, dots and dashes out).
_ANYWHERE = [
    "fuck", "motherf", "shit", "bitch", "nigg", "faggot", "fagot", "retard", "whore",
    "slut", "wank", "bollock", "asshole", "arsehole", "dickhead", "pussy", "nazi",
    "hitler", "tranny", "porn", "cocksuck", "blowjob", "dildo", "jizz",
]
# Matched as whole words only.
_WORDS = [
    "ass", "arse", "cock", "dick", "fag", "piss", "tits", "twat", "rape", "cum", "sex", "kkk",
    "prick", "cunt", "rapist", "kike", "chink", "spic", "bastard", "boob", "boobs", "penis", "vagina", "anal",
]

_WORD_RE = re.compile(r"\b(" + "|".join(map(re.escape, _WORDS)) + r")s?\b")


def _norm(text: str) -> str:
    return text.lower().translate(_SWAPS)


def is_profane(text: str) -> bool:
    t = _norm(text)
    squashed = re.sub(r"[\s._\-*~]+", "", t)
    if any(w in squashed for w in _ANYWHERE):
        return True
    return bool(_WORD_RE.search(t))


def mask(text: str) -> str:
    """The text with each offending word replaced by stars (for map labels)."""
    if not is_profane(text):
        return text
    parts = re.split(r"(\s+)", text)
    masked = ["*" * len(p) if p.strip() and is_profane(p) else p for p in parts]
    out = "".join(masked)
    # Spread over several words ("f u c k"): star the lot.
    return out if not is_profane(out) else "*" * len(text)
