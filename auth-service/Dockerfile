FROM node:20-alpine AS deps
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm config set fetch-retries 5 \
 && npm config set fetch-retry-factor 2 \
 && npm config set fetch-timeout 600000 \
 && npm config set fetch-retry-maxtimeout 600000 \
 && npm config set audit false \
 && npm config set fund false
RUN --mount=type=cache,target=/root/.npm npm install --omit=dev --no-audit --no-fund

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
USER node
EXPOSE 5000
CMD ["npm", "start"]
