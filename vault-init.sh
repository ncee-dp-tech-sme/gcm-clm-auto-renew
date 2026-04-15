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
    vault operator init -key-shares=1 -key-threshold=1 -format=json > /vault-config/init-keys.json
    
    # Extract unseal key and root token
    UNSEAL_KEY=$(cat /vault-config/init-keys.json | grep -o '"unseal_keys_b64":\["[^"]*"' | cut -d'"' -f4)
    ROOT_TOKEN=$(cat /vault-config/init-keys.json | grep -o '"root_token":"[^"]*"' | cut -d'"' -f4)
    
    echo "Vault initialized successfully!"
    echo "Unseal key and root token saved to /vault-config/init-keys.json"
    echo "IMPORTANT: Save this file securely!"
else
    echo "Vault is already initialized"
    
    # Try to load existing keys
    if [ -f /vault-config/init-keys.json ]; then
        UNSEAL_KEY=$(cat /vault-config/init-keys.json | grep -o '"unseal_keys_b64":\["[^"]*"' | cut -d'"' -f4)
        ROOT_TOKEN=$(cat /vault-config/init-keys.json | grep -o '"root_token":"[^"]*"' | cut -d'"' -f4)
    else
        echo "ERROR: Vault is initialized but init-keys.json not found!"
        echo "Cannot proceed without unseal key and root token"
        exit 1
    fi
fi

# Unseal Vault
echo ""
echo "Unsealing Vault..."
echo "$UNSEAL_KEY" | vault operator unseal -

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
    ttl=87600h > /vault-config/root_ca.crt

echo "Root CA certificate saved to /vault-config/root_ca.crt"

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
cat > /vault-config/acme-config.json <<EOF
{
  "email": "admin@localhost",
  "domain": "localhost",
  "acmeDirectoryUrl": "http://vault:8200/v1/pki/acme/directory",
  "challengeType": "http-01",
  "accountKeyPath": "/app/data/acme-account-key.pem",
  "certificatePath": "/app/certs/fullchain.pem",
  "privateKeyPath": "/app/certs/privkey.pem",
  "checkIntervalMinutes": 3
}
EOF

echo "ACME configuration saved to /vault-config/acme-config.json"

echo ""
echo "Step 9: Saving root token to file for cert-monitor..."
echo "$ROOT_TOKEN" > /vault-config/root-token.txt
chmod 600 /vault-config/root-token.txt
echo "Root token saved to /vault-config/root-token.txt"

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
echo ""
echo "Root CA certificate location: /vault-config/root_ca.crt"
echo "ACME config location: /vault-config/acme-config.json"
echo ""
echo "You can now use the ACME client to obtain certificates!"
echo ""

# Made with Bob
