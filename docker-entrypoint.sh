#!/bin/bash
set -e

echo "Starting Certificate Monitor Docker Container..."

# Wait for Vault PKI to be accessible (max 60 seconds)
echo "Waiting for Vault PKI to be ready..."
WAIT_COUNT=0
MAX_WAIT=60
VAULT_READY=false

while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    # Check if Vault is accessible (use health endpoint which doesn't require auth)
    if curl -s -f "${VAULT_ADDR:-http://vault:8200}/v1/sys/health?standbyok=true&sealedcode=200&uninitcode=200" > /dev/null 2>&1; then
        echo "Vault is accessible!"
        VAULT_READY=true
        break
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
    if [ $((WAIT_COUNT % 10)) -eq 0 ]; then
        echo "Still waiting for Vault... (${WAIT_COUNT}s)"
    fi
done

if [ "$VAULT_READY" = "false" ]; then
    echo "WARNING: Vault did not become accessible within ${MAX_WAIT} seconds"
    echo "The application will start but may not be able to obtain certificates"
else
    echo "Vault is ready!"
fi

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

# Copy ACME config from vault-config if it exists and is not already in app/data
if [ -f /vault-config/acme-config.json ] && [ ! -f /app/data/acme-config.json ]; then
    echo "Copying ACME configuration from Vault..."
    cp /vault-config/acme-config.json /app/data/acme-config.json
    chown appuser:appuser /app/data/acme-config.json
    echo "ACME configuration copied successfully"
fi

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
