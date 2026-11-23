FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
# Cloud Run defaults: Cloud SQL via DATABASE_URL, Cloud Storage uploads,
# and scheduled jobs triggered by Cloud Scheduler (see README).
ENV UPLOAD_STORAGE=gcs
ENV SCHEDULER_MODE=external
ENV PORT=8080

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma

EXPOSE 8080

# Migrations take a database lock, so parallel instances starting together are safe.
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node src/index.js"]
