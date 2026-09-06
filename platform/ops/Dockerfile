# Supported single-host image. Pin the locally verified image ID or a reviewed
# registry digest in the deployment record.
FROM node:22-bookworm-slim
WORKDIR /opt/atelier
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p /data && chown node:node /data && chmod 700 /data
USER node
ENV NODE_ENV=production ATELIER_BIND=0.0.0.0 PORT=4310 ATELIER_DATA_DIR=/data ATELIER_WORKER=false ATELIER_TRUST_LOOPBACK_PROXY=false
EXPOSE 4310
CMD ["node", "scripts/start.mjs"]
# Supply HTTPS public origin and a read-only master-key secret mount.
# Mount local persistent /data. Run scripts/worker.mjs separately on this same host.
# Publish port on 127.0.0.1 only. Never mount one SQLite WAL across multiple hosts.
