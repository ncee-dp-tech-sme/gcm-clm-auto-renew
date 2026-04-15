#!/bin/bash
set -e

echo "Starting Certificate Monitor Docker Container..."

# Create necessary directories if they don't exist
mkdir -p /app/certs
mkdir -p /app/data
mkdir -p /var/www/html/.well-known/acme-challenge
mkdir -p /var/log/nginx
mkdir -p /var/log/supervisor

# Set proper permissions
chown -R appuser:appuser /app/data
chown -R appuser:appuser /var/www/html
chown -R nginx:nginx /var/log/nginx

# Check if certificates exist, if not create self-signed ones for initial startup
if [ ! -f /app/certs/fullchain.pem ] || [ ! -f /app/certs/privkey.pem ]; then
    echo "No certificates found. Creating self-signed certificates for initial startup..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /app/certs/privkey.pem \
        -out /app/certs/fullchain.pem \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
    chown appuser:appuser /app/certs/*.pem
    chmod 600 /app/certs/privkey.pem
    chmod 644 /app/certs/fullchain.pem
    echo "Self-signed certificates created."
fi

# Display environment information
echo "Environment Configuration:"
echo "  NODE_ENV: ${NODE_ENV:-production}"
echo "  PORT: ${PORT:-3000}"
echo "  VAULT_ADDR: ${VAULT_ADDR:-not set}"

# Test nginx configuration
echo "Testing nginx configuration..."
nginx -t

echo "Starting services with supervisord..."

# Execute the main command
exec "$@"

# Made with Bob
