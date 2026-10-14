# Development tooling: Node, pnpm, dev server, lint, type check, tests, build.
FROM node:24.21.0-trixie-slim

ARG PNPM_VERSION=12.11.2
ARG HOST_UID=1000
ARG HOST_GID=1000

RUN npm install -g pnpm@${PNPM_VERSION} \
 && mkdir -p /app/node_modules /pnpm-store /home/dev \
 && chown -R ${HOST_UID}:${HOST_GID} /app /pnpm-store /home/dev

ENV HOME=/home/dev \
    npm_config_store_dir=/pnpm-store

WORKDIR /app
