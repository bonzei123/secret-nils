# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json

RUN npm ci

COPY shared shared
COPY server server
COPY client client

RUN npm run build

FROM node:22-bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=1488 \
    HOST=0.0.0.0 \
    POLICIES_PATH=/app/data/policies.json \
    REGISTER_PATH=/app/registergericht \
    npm_config_update_notifier=false

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json

RUN npm ci --omit=dev && npm cache clean --force \
  && mkdir -p /app/data \
  && chown -R node:node /app

COPY --from=build --chown=node:node /app/shared/src ./shared/src
COPY --from=build --chown=node:node /app/server/src ./server/src
COPY --from=build --chown=node:node /app/client/dist ./client/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/registergericht \
  && chown node:node /app/registergericht

USER root

EXPOSE 1488

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||1488)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
