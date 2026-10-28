# syntax=docker/dockerfile:1
# Single Dockerfile for api | web | worker — controlled by SERVICE_TYPE.
#
# Railway: set SERVICE_TYPE=api (or web / worker) on each service.
# Build:  docker build --build-arg SERVICE_TYPE=api -t em-api .
# Local:  SERVICE_TYPE=api node scripts/start-by-type.mjs

ARG SERVICE_TYPE=api

FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/domain/package.json packages/domain/
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
ARG SERVICE_TYPE=api
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
ENV SERVICE_TYPE=$SERVICE_TYPE
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_ENV=production
COPY . .
RUN node scripts/build-by-type.mjs \
  && mkdir -p apps/web/public apps/web/.next/static

FROM base AS runner
ARG SERVICE_TYPE=api
ENV SERVICE_TYPE=$SERVICE_TYPE
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/apps ./apps

EXPOSE 3000 4000
CMD ["node", "scripts/start-by-type.mjs"]
