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
RUN npm run build --if-present || npx ng build --configuration=production

# Normalizar salida a /out (soporta dist/<app>/browser o dist/<app>)
RUN mkdir -p /out && \
    if [ -d dist/*/browser ]; then \
      cp -r dist/*/browser/* /out/; \
    elif [ -d dist/* ]; then \
      cp -r dist/*/* /out/ || cp -r dist/* /out/; \
    fi

# ---------- runtime ----------
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out/ ./
EXPOSE 80
