FROM node:20-bullseye AS base
WORKDIR /app

# Install OpenSSL and other required dependencies with fallback
RUN apt-get update && \
    (apt-get install -y libssl1.1 || \
     apt-get install -y libssl3 || \
     apt-get install -y libssl1.1-dev || \
     echo "SSL package installation failed, continuing...") && \
    apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --production

COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
RUN npm run build

FROM node:20-bullseye AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Install runtime dependencies with fallback
RUN apt-get update && \
    (apt-get install -y libssl1.1 || \
     apt-get install -y libssl3 || \
     apt-get install -y libssl1.1-dev || \
     echo "SSL package installation failed, continuing...") && \
    apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=base /app/package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/dist ./dist
COPY --from=base /app/prisma ./prisma

EXPOSE 4000
CMD ["node", "dist/server.js"]


