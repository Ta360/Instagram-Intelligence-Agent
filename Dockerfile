# Instagram Intelligence Agent — single container (API + built React client).
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
COPY server/prisma server/prisma
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev --workspaces --include-workspace-root \
  && npm install --no-save prisma@6.19.3 -w server

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
USER node
EXPOSE 8080
# Apply the schema, then start the API (which also serves the React build).
CMD ["sh", "-c", "cd server && npx prisma db push --skip-generate && node dist/index.js"]
