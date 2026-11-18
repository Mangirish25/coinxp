FROM node:22.14.0-bookworm-slim AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY client ./client
COPY server ./server
RUN npm run build --workspace client

FROM node:22.14.0-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3001 DB_PATH=/data/coinxp.sqlite BACKUP_DIR=/data/backups \
    CLIENT_ORIGIN=http://localhost:3001 \
    SCHEDULER_ENABLED=true GAMIFICATION_ENABLED=true
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev --workspace server --include-workspace-root=false
COPY server ./server
COPY --from=client-build /app/client/dist ./client/dist
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 0555 docker-entrypoint.sh && mkdir -p /data/backups && chown -R node:node /app /data && chmod 0555 /app && chmod 0750 /data /data/backups
USER node
VOLUME ["/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/docker-entrypoint.sh"]
