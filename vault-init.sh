#!/bin/sh
# Vault initialization script for Docker
# Automatically configures PKI secrets engine and ACME protocol

set -e

echo "==================================="
echo "Vault ACME Initialization Script"
echo "==================================="

# Wait for Vault to be ready
echo "Waiting for Vault to be ready..."
until vault status > /dev/null 2>&1; do
    echo "Vault is not ready yet, waiting..."
    sleep 2
done

echo "Vault is ready!"

# Check if already initialized
if vault secrets list | grep -q "pki/"; then
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
echo "Step 6: Enabling ACME protocol..."
vault write pki/config/acme enabled=true

echo ""
echo "Step 7: Configuring ACME cluster..."
vault write pki/config/cluster \
    path=http://vault:8200/v1/pki \
    aia_path=http://vault:8200/v1/pki

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
echo "Step 9: Testing ACME directory endpoint..."
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
