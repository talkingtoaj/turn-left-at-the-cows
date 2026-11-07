"""Cloudflare Turnstile check for uploads."""

from __future__ import annotations

import logging

import httpx

log = logging.getLogger("mapshare")

VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


class TurnstileVerifier:
    def __init__(self, secret: str) -> None:
        self.secret = secret

    def __call__(self, token: str, remote_ip: str | None) -> bool:
        if not token or len(token) > 4096:
            return False
        data = {"secret": self.secret, "response": token}
        if remote_ip:
            data["remoteip"] = remote_ip
        try:
            r = httpx.post(VERIFY_URL, data=data, timeout=8.0)
            ok = bool(r.json().get("success"))
        except Exception as e:  # network trouble: fail closed
            log.warning("turnstile verify failed: %s", type(e).__name__)
            return False
        return ok
