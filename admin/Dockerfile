# ---- build ----
# VITE_* vars are inlined into the JS bundle at build time (Vite, not a
# runtime thing), so they must be passed as build args here rather than as
# ordinary container environment variables -- setting them on the `admin`
# service in docker-compose.yml only takes effect at image build time.
FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL
ARG VITE_INTAKE_URL
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_INTAKE_URL=$VITE_INTAKE_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve ----
# `serve -s` (single/SPA mode) rewrites any not-found path to index.html, the
# same fallback render.yaml's rewrite rule provides -- needed since
# react-router client-side routes (e.g. /customers/:id) aren't real files.
FROM node:22-alpine AS production
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:80/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:80"]
