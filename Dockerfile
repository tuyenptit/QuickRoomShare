# Stage 1: Build frontend assets
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Minimal Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/app/data/app.db
ENV UPLOAD_DIR=/app/uploads
ENV FILE_TTL_HOURS=12
ENV MAX_FILE_SIZE_MB=200

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled frontend dist and server files
COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY tsconfig.json ./

# Create mountable data and uploads directories
RUN mkdir -p /app/data /app/uploads && chown -R node:node /app

USER node

EXPOSE 3000

VOLUME ["/app/data", "/app/uploads"]

CMD ["npm", "start"]
