"""Start the server the way Cloud Run does: `python -m mapshare` (PORT from env).

No command-line arguments are read, so a bare `python -m` start works.
"""

import logging
import os

import uvicorn

from .app import create_app


def main() -> None:
    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(levelname)s %(name)s: %(message)s")
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(
        create_app(),
        host="0.0.0.0",
        port=port,
        proxy_headers=True,
        forwarded_allow_ips="*",
        log_level=os.environ.get("LOG_LEVEL", "info").lower(),
    )


main()
