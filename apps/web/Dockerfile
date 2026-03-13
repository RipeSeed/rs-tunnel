FROM node:20-alpine
WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install
RUN pnpm --filter @ripeseed/shared build
RUN pnpm --filter @ripeseed/admin-web build

ENV NODE_ENV=production
CMD ["pnpm", "--filter", "@ripeseed/admin-web", "start", "--hostname", "0.0.0.0", "--port", "3000"]
