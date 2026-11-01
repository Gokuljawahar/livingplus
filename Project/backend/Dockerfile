FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL="file:/data/livingplus.db"
VOLUME ["/data"]

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push && node src/index.js"]
