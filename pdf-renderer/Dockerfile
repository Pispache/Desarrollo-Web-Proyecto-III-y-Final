FROM ghcr.io/puppeteer/puppeteer:21

WORKDIR /app

COPY package*.json ./
ENV NODE_ENV=production
RUN --mount=type=cache,target=/root/.npm npm install --omit=dev --no-audit --no-fund

COPY . .

USER pptruser

EXPOSE 3000
CMD ["npm", "start"]
