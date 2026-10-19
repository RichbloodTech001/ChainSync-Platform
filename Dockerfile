# Production image for ChainSync. Serves the Next.js web app and is reused by the
# monitoring worker (same code, different command — see docker-compose.prod.yml).
#
# The Base44 sandbox does NOT use this file: it runs the bind-mounted source with
# `next dev` (Dockerfile.base44). This one bakes the compiled app for deployment.
FROM node:20-bookworm-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
# `npm install` (not `npm ci`): this repository has no lockfile. Development
# dependencies are kept because the worker runs through tsx and release jobs need
# the Prisma CLI.
RUN npm install --no-audit --no-fund

FROM deps AS build
WORKDIR /app
COPY . .
RUN npx prisma generate && npm run build

FROM node:20-bookworm-slim AS runner
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/app ./app
COPY --from=build /app/lib ./lib
COPY --from=build /app/worker ./worker
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/tsconfig.json ./tsconfig.json
RUN useradd --system --uid 10014 chainsync && chown -R chainsync:chainsync /app
USER chainsync
EXPOSE 3000
# Readiness: proves the server answers and can reach the database.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
