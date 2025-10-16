FROM ghcr.io/puppeteer/puppeteer:21

WORKDIR /app

COPY package*.json ./
ENV NODE_ENV=production
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

COPY . .

USER pptruser

EXPOSE 3000
CMD ["npm", "start"]
