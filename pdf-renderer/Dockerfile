FROM node:18-slim
WORKDIR /app
COPY pdf-renderer/package.json /app/package.json
RUN npm install --omit=dev
COPY pdf-renderer /app
# Install curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
EXPOSE 3000
CMD ["npm", "start"]
