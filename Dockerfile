# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------
# ChessOx production image.
# This project's Vite/TanStack-Start config emits an SSR bundle served by
# `vite preview` (the supported serve path for this managed stack), so the
# runtime keeps the toolchain available. Builds are reproducible via npm ci.
# ---------------------------------------------------------------------

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Install deps from the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Build the SSR + client bundles. Public Supabase vars are injected at build
# time (override with --build-arg). Never bake secrets into the image.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Bring over installed modules and build artifacts only.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY --from=build /app/dis[t] ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/vite.config.ts ./vite.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json

# Run as the built-in unprivileged user.
USER node

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["npm", "run", "start"]
