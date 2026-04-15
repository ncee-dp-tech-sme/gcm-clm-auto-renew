# Certificate Monitor with ACME and nginx
# Multi-stage build for optimized image size

FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Production stage
FROM node:18-alpine

# Install nginx, openssl, curl, and bash
RUN apk add --no-cache \
    nginx \
    openssl \
    curl \
    bash \
    supervisor \
    && mkdir -p /run/nginx \
    && mkdir -p /var/log/supervisor

# Create app user
RUN addgroup -g 1001 -S appuser && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G appuser -g appuser appuser

# Set working directory
WORKDIR /app

# Copy Node.js dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application files
COPY --chown=appuser:appuser . .

# Create necessary directories
RUN mkdir -p /var/www/html/.well-known/acme-challenge \
    && mkdir -p /etc/nginx/sites-available \
    && mkdir -p /etc/nginx/sites-enabled \
    && mkdir -p /var/log/nginx \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /var/www/html \
    && chown -R appuser:appuser /app/data \
    && chown -R appuser:appuser /var/log/nginx

# Copy nginx configuration
COPY nginx-docker.conf /etc/nginx/http.d/default.conf

# Copy supervisor configuration
COPY supervisord.conf /etc/supervisord.conf

# Create entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose ports
EXPOSE 80 443 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    VAULT_ADDR=http://vault:8200 \
    DATA_DIR=/app/data \
    CERT_DIR=/app/certs

# Use supervisor to run both nginx and Node.js
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]