# TrainLive / Hostinger VPS: build Next.js without privileged runtime credentials.
FROM node:22-bookworm-slim AS build
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/trainlive/package*.json ./apps/trainlive/
RUN npm install --prefix apps/trainlive --no-audit --no-fund
COPY apps/trainlive/ ./apps/trainlive/
RUN npm run typecheck --prefix apps/trainlive \
 && npm run build --prefix apps/trainlive \
 && npm prune --prefix apps/trainlive --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /workspace/apps/trainlive/ ./
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
