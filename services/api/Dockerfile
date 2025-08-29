# AI API Integrator - Production Dockerfile
# Multi-stage build for optimized production image

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy package files
COPY package*.json ./
COPY services/api/package*.json ./services/api/

# Install dependencies
RUN npm ci --only=production --ignore-scripts
RUN cd services/api && npm ci --only=production --ignore-scripts

# Copy source code
COPY services/api/ ./services/api/

# Build the application
WORKDIR /app/services/api
RUN npm run build

# Remove dev dependencies and clean up
RUN npm prune --production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Copy built application from builder stage
COPY --from=builder --chown=nestjs:nodejs /app/services/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/services/api/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/services/api/package*.json ./

# Create necessary directories
RUN mkdir -p /app/logs /app/uploads /app/temp && \
    chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]

# Labels for metadata
LABEL maintainer="AI API Integrator Team"
LABEL version="1.0.0"
LABEL description="AI API Integrator - Production API Server"
LABEL org.opencontainers.image.source="https://github.com/your-org/ai-api-integrator"
