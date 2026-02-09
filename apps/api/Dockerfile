FROM node:20-alpine
WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install
RUN pnpm --filter @ripeseed/shared build
RUN pnpm --filter @ripeseed/api build

ENV NODE_ENV=production
CMD ["sh", "-c", "node apps/api/dist/db/migrate.js && node apps/api/dist/index.js"]
