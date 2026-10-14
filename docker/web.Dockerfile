# Production image: build the app, then serve it with nginx over HTTPS on 8787.
# Certificates are mounted at runtime, never baked into the image.
FROM node:24.21.0-trixie-slim AS build

ARG PNPM_VERSION=12.11.2
RUN npm install -g pnpm@${PNPM_VERSION}

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginxinc/nginx-unprivileged:1.30.5-alpine3.24

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/headers.conf /etc/nginx/snippets/headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8787
