# Development tooling: Node, pnpm, dev server, lint, type check, tests, build.
FROM node:24.21.0-trixie-slim

ARG PNPM_VERSION=12.11.2
ARG HOST_UID=1000
ARG HOST_GID=1000
# KTX-Software encodes GPU-compressed KTX2 textures for `make scenery` (D-022).
ARG KTX_VERSION=4.4.2
ARG KTX_SHA1=b7d4a0833a5aff570f01f56413e40ea8db291212

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && curl -fsSL -o /tmp/ktx.deb \
      "https://github.com/KhronosGroup/KTX-Software/releases/download/v${KTX_VERSION}/KTX-Software-${KTX_VERSION}-Linux-x86_64.deb" \
 && echo "${KTX_SHA1}  /tmp/ktx.deb" | sha1sum -c - \
 && apt-get install -y --no-install-recommends /tmp/ktx.deb \
 && rm /tmp/ktx.deb \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm@${PNPM_VERSION} \
 && mkdir -p /app/node_modules /pnpm-store /home/dev \
 && chown -R ${HOST_UID}:${HOST_GID} /app /pnpm-store /home/dev

ENV HOME=/home/dev \
    npm_config_store_dir=/pnpm-store

WORKDIR /app
