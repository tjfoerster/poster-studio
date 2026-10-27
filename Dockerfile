# Poster Studio as a static website, for Coolify or any other Docker host:
#   docker build -t poster-studio . && docker run --rm -p 8080:80 poster-studio   → http://localhost:8080
# Stage 1 builds it with Node (after the engine's tests pass); stage 2 serves the files with nginx on port 80.
# The editor runs entirely in the browser: no database, no volumes, no environment variables.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/app/package.json packages/app/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

FROM nginx:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
