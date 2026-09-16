FROM node:22-bookworm-slim

WORKDIR /app

# Native dependency support for better-sqlite3 during npm install.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/client/package.json packages/client/package.json

RUN npm ci

COPY packages ./packages
COPY scripts ./scripts
COPY bin ./bin

RUN npm run build

ENV NODE_ENV=production \
    AGENT_MOVE_HOST=0.0.0.0 \
    AGENT_MOVE_PORT=3333

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Start the server directly: Docker collectors should not auto-install CLI hooks.
CMD ["node", "packages/server/dist/index.js"]
