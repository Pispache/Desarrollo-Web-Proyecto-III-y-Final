# ---------- build ----------
FROM node:20 AS build
WORKDIR /app

# Manifiestos (si faltan, falla aquí)
COPY package.json ./
COPY package-lock.json ./

# Instalar deps (más tolerante que ci)
ENV NPM_CONFIG_LEGACY_PEER_DEPS=true
RUN npm cache clean --force && npm install

# Código y build prod
COPY . .
# Forzamos build sin prerender y con salida directa a /out para evitar copiados condicionales
RUN npx ng build --configuration=production --no-prerender --output-path=/out || \
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
