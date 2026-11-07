# Turn Left at the Cows: the built game (Vite) served by the Python server
# (server/, FastAPI), which also runs the shared-maps API. Build from the repo root:
#   docker build -t turn-left-at-the-cows .

# ---- 1. Build the game ----
FROM node:22-slim AS web
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html three.html sounds.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY src3 ./src3
# Absolute links in the pages' canonical / Open Graph tags (optional).
ARG SITE_URL=""
ENV SITE_URL=${SITE_URL}
RUN npm run build

# ---- 2. Python dependencies ----
FROM python:3.13-slim AS deps
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/
WORKDIR /app/server
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
COPY server/pyproject.toml server/uv.lock server/.python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

# ---- 3. Runtime ----
FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /bin/
RUN useradd --create-home --uid 10001 app
WORKDIR /app/server
COPY --from=deps /app/server/.venv /app/server/.venv
COPY server/pyproject.toml server/uv.lock server/.python-version ./
COPY server/mapshare ./mapshare
COPY --from=web /web/dist /app/dist
ENV PORT=8080 \
    DIST_DIR=/app/dist \
    UV_NO_CACHE=1 \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1
USER app
EXPOSE 8080
# No argv: `python -m mapshare` reads everything from the environment.
CMD ["uv", "run", "--frozen", "--no-dev", "python", "-m", "mapshare"]
