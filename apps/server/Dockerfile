FROM node:25-slim
RUN npm i -g pnpm@12.8.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter server...
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter server db:generate && pnpm --filter server build
WORKDIR /app/apps/server
EXPOSE 3000
# Run migrations, then start
CMD ["sh", "-c", "pnpm db:deploy && node dist/main.js"]
