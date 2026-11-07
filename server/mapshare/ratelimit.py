"""Sliding-window rate limits kept in memory.

Per Cloud Run instance, so a busy service with several instances lets a bit
more through; for a small game that is fine, and it needs no database.
"""

from __future__ import annotations

import threading
import time
from collections import deque


class RateLimiter:
    def __init__(self, limit: int, window_s: float = 3600.0, clock=time.monotonic) -> None:
        self.limit = limit
        self.window = window_s
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """Counts one hit for key; False (and not counted) when over the limit."""
        now = self._clock()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and q[0] <= now - self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            if len(self._hits) > 50_000:  # keep memory bounded
                self._prune(now)
            return True

    def _prune(self, now: float) -> None:
        for k in [k for k, q in self._hits.items() if not q or q[-1] <= now - self.window]:
            del self._hits[k]
