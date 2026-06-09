# --- Client build ---
FROM node:22-bookworm-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# --- Production image ---
FROM node:22-bookworm-slim AS production
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server --omit=dev

COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV CLIENT_DIST=/app/client/dist
# Fly sets PORT at runtime (default 8080).
ENV PORT=8080

EXPOSE 8080

WORKDIR /app/server
CMD ["npm", "start"]
