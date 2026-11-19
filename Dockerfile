# One container for the whole app (API + built frontend), for Cloud Run.
# Build from the repository root:
#   docker build -t livingplus .
# See deploy/gcp-deploy.sh for the full Google Cloud deployment.

# --- Frontend -------------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY Project/frontend/package*.json ./
RUN npm ci
COPY Project/frontend/ ./
# VITE_* values are compiled into the public JavaScript bundle (not secret).
ARG VITE_ROOT_DOMAIN=""
ARG VITE_SINGLE_HOST_MODE="true"
ARG VITE_GOOGLE_MAPS_API_KEY=""
RUN VITE_ROOT_DOMAIN="$VITE_ROOT_DOMAIN" \
    VITE_SINGLE_HOST_MODE="$VITE_SINGLE_HOST_MODE" VITE_GOOGLE_MAPS_API_KEY="$VITE_GOOGLE_MAPS_API_KEY" \
    npm run build

# --- Backend --------------------------------------------------------------
FROM node:22-alpine AS backend
WORKDIR /app
COPY Project/backend/package*.json ./
RUN npm ci --include=dev
COPY Project/backend/ ./
RUN npx prisma generate && npm run build && npm prune --omit=dev

# --- Runtime --------------------------------------------------------------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    FRONTEND_DIST_DIR=/app/public \
    UPLOAD_STORAGE=gcs \
    SCHEDULER_MODE=external \
    SINGLE_HOST_MODE=true
COPY --from=backend /app/package.json ./package.json
COPY --from=backend /app/node_modules ./node_modules
COPY --from=backend /app/src ./src
COPY --from=backend /app/prisma ./prisma
COPY --from=frontend /app/frontend/dist ./public
USER node
EXPOSE 8080
# Migrations take a database lock, so instances starting together are safe.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node src/index.js"]
