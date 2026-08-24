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
FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O- http://localhost/ >/dev/null || exit 1
