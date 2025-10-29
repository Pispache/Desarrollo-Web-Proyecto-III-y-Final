# ---------- build ----------
FROM node:20 AS build
WORKDIR /app

# Manifiestos
COPY package.json package-lock.json ./

# Instalar deps determinísticamente con cache
ENV NODE_OPTIONS=--max-old-space-size=1024 \
    NG_CLI_ANALYTICS=false \
    CI=true
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# Código y build prod
COPY . .
RUN --mount=type=cache,target=/app/.angular/cache \
    npx ng build --configuration=production --no-prerender --output-path=/out || \
    npm run build -- --configuration=production --no-prerender --output-path=/out

# ---------- runtime ----------
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out/ ./
# Si el build produjo carpetas SSR (browser/server), aplanamos para servir desde root
RUN if [ -d ./browser ]; then \
      cp -r ./browser/* ./ && rm -rf ./browser ./server; \
    fi
# Asegurar que el index de Angular reemplace al index por defecto de Nginx
RUN if [ -f ./index.csr.html ]; then \
      cp -f ./index.csr.html ./index.html; \
    fi
EXPOSE 80
