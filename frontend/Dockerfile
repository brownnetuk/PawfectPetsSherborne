# ---- build ----
# VITE_API_URL is inlined into the JS bundle at build time (Vite, not a
# runtime thing), so it must be passed as a build arg rather than an ordinary
# container environment variable -- setting it on the `frontend` service in
# docker-compose.yml only takes effect at image build time.
FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve ----
# `serve -s` (single/SPA mode) rewrites any not-found path to index.html --
# App.tsx parses /intake/:id, /intake/:id/add-pet, and /forms/:id itself from
# window.location.pathname, so every one of those needs to actually load
# index.html on a direct link/hard refresh, same as render.yaml's rewrite.
FROM node:22-alpine AS production
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:80/',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["serve", "-s", "dist", "-l", "tcp://0.0.0.0:80"]
