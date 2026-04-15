#!/bin/sh
# Vault initialization script for Docker
# Automatically configures PKI secrets engine and ACME protocol

set -e

echo "==================================="
echo "Vault ACME Initialization Script"
echo "==================================="

# Wait for Vault API to be accessible (not necessarily initialized)
echo "Waiting for Vault API to be accessible..."
MAX_RETRIES=30
RETRY_COUNT=0

until vault status -format=json 2>/dev/null | grep -q "initialized"; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "ERROR: Vault API did not become accessible after $MAX_RETRIES attempts"
        echo "Last vault status attempt:"
        vault status 2>&1 || echo "Vault CLI not responding"
        exit 1
    fi
    echo "Vault API not accessible yet, waiting... (attempt $RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done

echo "Vault API is accessible!"

# Check if Vault is initialized
if ! vault status 2>/dev/null | grep -q "Initialized.*true"; then
    echo ""
    echo "Initializing Vault..."
    
    # Write to /tmp first (always writable), then copy to vault-config
    vault operator init -key-shares=1 -key-threshold=1 -format=json > /tmp/init-keys.json
    
    # Try to copy to vault-config, but don't fail if we can't
    if cp /tmp/init-keys.json /vault-config/init-keys.json 2>/dev/null; then
        echo "Init keys saved to /vault-config/init-keys.json"
    else
        echo "WARNING: Could not write to /vault-config/init-keys.json (permission denied)"
        echo "Using temporary file at /tmp/init-keys.json instead"
    fi
    
    # Debug: Show the actual JSON content
    echo "DEBUG: JSON content:"
    cat /tmp/init-keys.json
    echo ""
    
    # Extract unseal key and root token - try multiple approaches
    # The JSON might be formatted differently, so let's try a more flexible approach
    UNSEAL_KEY=$(grep -o '"unseal_keys_b64"[[:space:]]*:[[:space:]]*\[[[:space:]]*"[^"]*"' /tmp/init-keys.json | sed 's/.*"\([^"]*\)"$/\1/')
    if [ -z "$UNSEAL_KEY" ]; then
        # Try alternative format
        UNSEAL_KEY=$(grep -A1 '"unseal_keys_b64"' /tmp/init-keys.json | tail -1 | sed 's/[^"]*"\([^"]*\)".*/\1/')
    fi
    
    ROOT_TOKEN=$(grep -o '"root_token"[[:space:]]*:[[:space:]]*"[^"]*"' /tmp/init-keys.json | sed 's/.*"\([^"]*\)"$/\1/')
    
    # Debug output
    echo "DEBUG: Extracted unseal key length: ${#UNSEAL_KEY}"
    echo "DEBUG: First 20 chars of unseal key: ${UNSEAL_KEY:0:20}"
    echo "DEBUG: Root token length: ${#ROOT_TOKEN}"
    
    echo "Vault initialized successfully!"
    echo "Unseal key and root token saved"
    echo "IMPORTANT: Save these credentials securely!"
else
    echo "Vault is already initialized"
    
    # Try to load existing keys from either location
    if [ -f /vault-config/init-keys.json ]; then
        UNSEAL_KEY=$(cat /vault-config/init-keys.json | grep -o '"unseal_keys_b64":\["[^"]*"' | cut -d'"' -f4)
        ROOT_TOKEN=$(cat /vault-config/init-keys.json | grep -o '"root_token":"[^"]*"' | cut -d'"' -f4)
    elif [ -f /tmp/init-keys.json ]; then
        UNSEAL_KEY=$(cat /tmp/init-keys.json | grep -o '"unseal_keys_b64":\["[^"]*"' | cut -d'"' -f4)
        ROOT_TOKEN=$(cat /tmp/init-keys.json | grep -o '"root_token":"[^"]*"' | cut -d'"' -f4)
    else
        echo "ERROR: Vault is initialized but init-keys.json not found!"
        echo "Cannot proceed without unseal key and root token"
        exit 1
    fi
fi

# Unseal Vault
echo ""
echo "Unsealing Vault..."
vault operator unseal "$UNSEAL_KEY"

# Set root token for subsequent commands
export VAULT_TOKEN="$ROOT_TOKEN"

echo "Vault unsealed and ready!"

# Check if already initialized
if vault secrets list 2>/dev/null | grep -q "pki/"; then
    echo "PKI secrets engine already enabled. Skipping initialization."
    exit 0
fi

echo ""
echo "Step 1: Enabling PKI secrets engine..."
vault secrets enable pki

echo ""
echo "Step 2: Tuning PKI secrets engine to 10 years max lease..."
vault secrets tune -max-lease-ttl=87600h pki

echo ""
echo "Step 3: Generating root CA certificate..."
vault write -field=certificate pki/root/generate/internal \
    common_name="Docker Local Root CA" \
    issuer_name="root-2024" \
    ttl=87600h > /tmp/root_ca.crt

# Try to copy to vault-config, but don't fail if we can't
if cp /tmp/root_ca.crt /vault-config/root_ca.crt 2>/dev/null; then
    echo "Root CA certificate saved to /vault-config/root_ca.crt"
else
    echo "Root CA certificate saved to /tmp/root_ca.crt"
fi

echo ""
echo "Step 4: Configuring CA and CRL URLs..."
vault write pki/config/urls \
    issuing_certificates="http://vault:8200/v1/pki/ca" \
    crl_distribution_points="http://vault:8200/v1/pki/crl"

echo ""
echo "Step 5: Creating PKI role for localhost..."
vault write pki/roles/localhost \
    allowed_domains="localhost,*.localhost,127.0.0.1" \
    allow_subdomains=true \
    allow_localhost=true \
    allow_ip_sans=true \
    max_ttl="720h" \
    ttl="720h" \
    key_type="rsa" \
    key_bits=2048

echo ""
echo "Step 6: Configuring ACME cluster (MUST be done before enabling ACME)..."
vault write pki/config/cluster \
    path=http://vault:8200/v1/pki \
    aia_path=http://vault:8200/v1/pki

echo ""
echo "Step 7: Enabling ACME protocol..."
vault write pki/config/acme enabled=true

echo ""
echo "Step 8: Creating ACME configuration file for cert-monitor..."
cat > /tmp/acme-config.json <<EOF
{
  "email": "admin@localhost",
  "domain": "localhost",
  "acmeDirectoryUrl": "http://vault:8200/v1/pki/roles/localhost/acme/directory",
  "challengeType": "http-01",
  "accountKeyPath": "/app/data/acme-account-key.pem",
  "certificatePath": "/app/certs/fullchain.pem",
  "privateKeyPath": "/app/certs/privkey.pem",
  "checkIntervalMinutes": 3
}
EOF

# Try to copy to vault-config, but don't fail if we can't
if cp /tmp/acme-config.json /vault-config/acme-config.json 2>/dev/null; then
    echo "ACME configuration saved to /vault-config/acme-config.json"
else
    echo "ACME configuration saved to /tmp/acme-config.json"
fi

echo ""
echo "Step 9: Enabling KV secrets engine for token storage..."
vault secrets enable -path=secret kv-v2 || echo "KV secrets engine may already be enabled"

echo ""
echo "Step 10: Saving root token to Vault KV for cert-monitor..."
vault kv put secret/root-token value="$ROOT_TOKEN"
echo "Root token saved to Vault at secret/root-token"

echo ""
echo "Step 11: Also attempting to save token to file (may fail due to permissions)..."
if echo "$ROOT_TOKEN" > /vault-config/root-token.txt 2>/dev/null; then
    chmod 644 /vault-config/root-token.txt 2>/dev/null || true
    echo "Root token also saved to /vault-config/root-token.txt"
else
    echo "WARNING: Could not write to /vault-config/root-token.txt (permission denied)"
    echo "Token is available in Vault at secret/root-token"
fi

echo ""
echo "Step 10: Creating completion marker..."
touch /tmp/.vault-init-complete

# Try to copy to vault-config, but don't fail if we can't
if cp /tmp/.vault-init-complete /vault-config/.vault-init-complete 2>/dev/null; then
    echo "Completion marker created at /vault-config/.vault-init-complete"
else
    echo "Completion marker created at /tmp/.vault-init-complete"
fi

echo "Vault initialization and ACME configuration complete!"

echo ""
echo "Step 10: Testing ACME directory endpoint..."
if vault read pki/acme/directory > /dev/null 2>&1; then
    echo "✓ ACME directory endpoint is accessible"
else
    echo "✗ Warning: ACME directory endpoint test failed"
fi

echo ""
echo "==================================="
echo "Vault ACME Configuration Complete!"
echo "==================================="
echo ""
echo "Configuration Summary:"
echo "  - PKI Secrets Engine: Enabled at pki/"
echo "  - Root CA: Generated (10 year validity)"
echo "  - PKI Role: 'localhost' created"
echo "  - ACME Protocol: Enabled"
echo "  - ACME Directory URL: http://vault:8200/v1/pki/acme/directory"
echo "  - Root Token: $ROOT_TOKEN"
echo ""
echo "Note: Due to volume permissions, files are stored in /tmp"
echo "The cert-monitor container will read the root token from Vault directly"
echo ""
echo "You can now use Vault PKI to obtain certificates!"
echo ""

# Made with Bob
