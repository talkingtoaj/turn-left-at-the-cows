"""Object storage for shared maps: Google Cloud Storage in production, a local
folder for dev, and an in-memory fake for tests.

All three behave the same way: every object has a generation number that
changes on each write, and a write can say "only if the generation is still
N" (N = 0: only if it does not exist yet). That compare-and-swap is what
keeps votes and reports safe when two people click at the same moment.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Protocol


class Conflict(Exception):
    """The object changed (or already exists) since it was read."""


class Storage(Protocol):
    def list(self, prefix: str) -> list[tuple[str, int]]:
        """(name, generation) of every object whose name starts with prefix."""

    def read(self, name: str) -> tuple[bytes, int] | None:
        """(data, generation), or None when the object does not exist."""

    def write(self, name: str, data: bytes, if_generation_match: int | None = None) -> int:
        """Writes the object and returns its new generation. With
        if_generation_match, raises Conflict unless the stored generation is
        that number (0 = must not exist yet)."""


class MemoryStorage:
    def __init__(self) -> None:
        self._objects: dict[str, tuple[bytes, int]] = {}
        self._lock = threading.Lock()
        self._next = 1

    def list(self, prefix: str) -> list[tuple[str, int]]:
        with self._lock:
            return [(k, g) for k, (_, g) in self._objects.items() if k.startswith(prefix)]

    def read(self, name: str) -> tuple[bytes, int] | None:
        with self._lock:
            return self._objects.get(name)

    def write(self, name: str, data: bytes, if_generation_match: int | None = None) -> int:
        with self._lock:
            current = self._objects.get(name)
            if if_generation_match is not None:
                have = current[1] if current else 0
                if have != if_generation_match:
                    raise Conflict(name)
            gen = self._next
            self._next += 1
            self._objects[name] = (bytes(data), gen)
            return gen


class LocalStorage:
    """A folder on disk, for running the server locally (STORAGE=local).
    Generations are kept in memory per process plus the file's mtime, which is
    plenty for one dev server."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _path(self, name: str) -> Path:
        p = (self.root / name).resolve()
        if self.root.resolve() not in p.parents:
            raise ValueError("bad object name")
        return p

    @staticmethod
    def _gen(p: Path) -> int:
        return p.stat().st_mtime_ns

    def list(self, prefix: str) -> list[tuple[str, int]]:
        out = []
        root = self.root.resolve()
        for dirpath, _dirs, files in os.walk(root):
            for f in files:
                if f.endswith(".tmp"):
                    continue
                p = Path(dirpath) / f
                name = p.relative_to(root).as_posix()
                if name.startswith(prefix):
                    out.append((name, self._gen(p)))
        return out

    def read(self, name: str) -> tuple[bytes, int] | None:
        p = self._path(name)
        with self._lock:
            if not p.exists():
                return None
            return p.read_bytes(), self._gen(p)

    def write(self, name: str, data: bytes, if_generation_match: int | None = None) -> int:
        p = self._path(name)
        with self._lock:
            if if_generation_match is not None:
                have = self._gen(p) if p.exists() else 0
                if have != if_generation_match:
                    raise Conflict(name)
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.with_suffix(p.suffix + ".tmp")
            tmp.write_bytes(data)
            os.replace(tmp, p)
            # Make sure a rewrite within the same clock tick still changes the generation.
            gen = self._gen(p)
            if if_generation_match is not None and gen == if_generation_match:
                os.utime(p, ns=(gen + 1, gen + 1))
                gen += 1
            return gen


class GCSStorage:
    """Google Cloud Storage. Uses only object calls (no bucket metadata), so the
    runtime service account needs object access to the prefix and nothing else."""

    def __init__(self, bucket: str) -> None:
        from google.cloud import storage  # imported here so tests never need it

        self._client = storage.Client()
        self._bucket = self._client.bucket(bucket)

    def list(self, prefix: str) -> list[tuple[str, int]]:
        return [(b.name, int(b.generation)) for b in self._client.list_blobs(self._bucket, prefix=prefix)]

    def read(self, name: str) -> tuple[bytes, int] | None:
        from google.api_core.exceptions import NotFound

        blob = self._bucket.blob(name)
        try:
            data = blob.download_as_bytes()
        except NotFound:
            return None
        if blob.generation is None:
            blob.reload()
        return data, int(blob.generation)

    def write(self, name: str, data: bytes, if_generation_match: int | None = None) -> int:
        from google.api_core.exceptions import PreconditionFailed

        blob = self._bucket.blob(name)
        blob.cache_control = "no-store"
        try:
            blob.upload_from_string(data, content_type="application/json", if_generation_match=if_generation_match)
        except PreconditionFailed as e:
            raise Conflict(name) from e
        return int(blob.generation)


def make_storage(settings) -> Storage:
    if settings.storage == "memory":
        return MemoryStorage()
    if settings.storage == "local":
        return LocalStorage(settings.local_dir)
    if not settings.bucket:
        raise RuntimeError("STORAGE=gcs needs MAPS_BUCKET")
    return GCSStorage(settings.bucket)
