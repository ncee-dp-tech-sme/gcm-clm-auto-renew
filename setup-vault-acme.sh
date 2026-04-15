#!/bin/bash

# HashiCorp Vault ACME Setup Script
# This script enables and configures ACME on a Vault PKI secrets engine
# and generates client configuration for certificate management

set -e

echo "🔐 HashiCorp Vault ACME Setup"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
VAULT_ADDR="${VAULT_ADDR:-http://127.0.0.1:8200}"
PKI_PATH="${PKI_PATH:-pki}"
PKI_ROLE="${PKI_ROLE:-acme-role}"
DOMAIN="${DOMAIN:-localhost}"
OUTPUT_DIR="./vault-acme-config"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --vault-addr)
            VAULT_ADDR="$2"
            shift 2
            ;;
        --pki-path)
            PKI_PATH="$2"
            shift 2
            ;;
        --role)
            PKI_ROLE="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --output-dir)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --vault-addr ADDR    Vault server address (default: http://127.0.0.1:8200)"
            echo "  --pki-path PATH      PKI secrets engine path (default: pki)"
            echo "  --role NAME          PKI role name (default: acme-role)"
            echo "  --domain DOMAIN      Domain for certificates (default: localhost)"
            echo "  --output-dir DIR     Output directory for config files (default: ./vault-acme-config)"
            echo "  -h, --help           Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  VAULT_ADDR           Vault server address"
            echo "  VAULT_TOKEN          Vault authentication token"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Check if vault CLI is installed
if ! command -v vault &> /dev/null; then
    echo -e "${RED}❌ Vault CLI is not installed${NC}"
    echo ""
    echo "Please install Vault CLI first:"
    echo "  macOS:   brew install vault"
    echo "  Linux:   https://www.vaultproject.io/downloads"
    exit 1
fi

echo -e "${GREEN}✓ Vault CLI is installed${NC}"
VAULT_VERSION=$(vault version | head -n1)
echo "  $VAULT_VERSION"
echo ""

# Check if VAULT_TOKEN is set
if [ -z "$VAULT_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  VAULT_TOKEN environment variable is not set${NC}"
    echo ""
    read -sp "Enter Vault token: " VAULT_TOKEN
    echo ""
    export VAULT_TOKEN
fi

# Set Vault address
export VAULT_ADDR

echo "Configuration:"
echo "  Vault Address: $VAULT_ADDR"
echo "  PKI Path: $PKI_PATH"
echo "  PKI Role: $PKI_ROLE"
echo "  Domain: $DOMAIN"
echo "  Output Directory: $OUTPUT_DIR"
echo ""

# Test Vault connection
echo "Testing Vault connection..."
if ! vault status &> /dev/null; then
    echo -e "${RED}❌ Cannot connect to Vault at $VAULT_ADDR${NC}"
    echo "Please check:"
    echo "  1. Vault server is running"
    echo "  2. VAULT_ADDR is correct"
    echo "  3. Network connectivity"
    exit 1
fi

echo -e "${GREEN}✓ Connected to Vault${NC}"
echo ""

# Check if PKI secrets engine exists
echo "Checking PKI secrets engine..."
if vault secrets list -format=json | jq -e ".\"${PKI_PATH}/\"" &> /dev/null; then
    echo -e "${GREEN}✓ PKI secrets engine exists at ${PKI_PATH}/${NC}"
else
    echo -e "${YELLOW}⚠️  PKI secrets engine not found at ${PKI_PATH}/${NC}"
    read -p "Do you want to enable it? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Enabling PKI secrets engine..."
        vault secrets enable -path="$PKI_PATH" pki
        vault secrets tune -max-lease-ttl=87600h "$PKI_PATH"
        echo -e "${GREEN}✓ PKI secrets engine enabled${NC}"
    else
        echo -e "${RED}Cannot proceed without PKI secrets engine${NC}"
        exit 1
    fi
fi
echo ""

# Generate root CA if it doesn't exist
echo "Checking for root CA..."
if vault read "${PKI_PATH}/cert/ca" &> /dev/null; then
    echo -e "${GREEN}✓ Root CA exists${NC}"
else
    echo -e "${YELLOW}⚠️  No root CA found${NC}"
    read -p "Do you want to generate a root CA? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Generating root CA..."
        vault write -field=certificate "${PKI_PATH}/root/generate/internal" \
            common_name="Vault Root CA" \
            ttl=87600h > /dev/null
        echo -e "${GREEN}✓ Root CA generated${NC}"
    else
        echo -e "${RED}Cannot proceed without root CA${NC}"
        exit 1
    fi
fi
echo ""

# Configure CA and CRL URLs
echo "Configuring CA and CRL URLs..."
vault write "${PKI_PATH}/config/urls" \
    issuing_certificates="${VAULT_ADDR}/v1/${PKI_PATH}/ca" \
    crl_distribution_points="${VAULT_ADDR}/v1/${PKI_PATH}/crl"
echo -e "${GREEN}✓ URLs configured${NC}"
echo ""

# Create or update PKI role
echo "Creating/updating PKI role: $PKI_ROLE..."
vault write "${PKI_PATH}/roles/${PKI_ROLE}" \
    allowed_domains="$DOMAIN" \
    allow_subdomains=true \
    allow_localhost=true \
    allow_bare_domains=true \
    allow_ip_sans=true \
    max_ttl="720h" \
    ttl="720h" \
    key_type="rsa" \
    key_bits=2048
echo -e "${GREEN}✓ PKI role created/updated${NC}"
echo ""

# Enable ACME
echo "Enabling ACME on PKI secrets engine..."
vault write "${PKI_PATH}/config/acme" \
    enabled=true \
    allowed_roles="$PKI_ROLE" \
    allowed_issuers="*" \
    default_directory_policy="sign-verbatim"
echo -e "${GREEN}✓ ACME enabled${NC}"
echo ""

# Get ACME directory URL
ACME_DIRECTORY_URL="${VAULT_ADDR}/v1/${PKI_PATH}/acme/directory"
echo -e "${BLUE}ACME Directory URL: $ACME_DIRECTORY_URL${NC}"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"
echo "Creating configuration files in: $OUTPUT_DIR"
echo ""

# Generate client configuration file
CLIENT_CONFIG_FILE="$OUTPUT_DIR/acme-client-config.json"
cat > "$CLIENT_CONFIG_FILE" << EOF
{
  "email": "admin@${DOMAIN}",
  "domain": "${DOMAIN}",
  "acmeDirectoryUrl": "${ACME_DIRECTORY_URL}",
  "challengeType": "http-01",
  "accountKeyPath": "./vault-acme-account-key.pem",
  "certificatePath": "./vault-acme-certificate.pem",
  "privateKeyPath": "./vault-acme-private-key.pem",
  "checkIntervalMinutes": 3,
  "vaultConfig": {
    "vaultAddr": "${VAULT_ADDR}",
    "pkiPath": "${PKI_PATH}",
    "pkiRole": "${PKI_ROLE}"
  }
}
EOF
echo -e "${GREEN}✓ Created: $CLIENT_CONFIG_FILE${NC}"

# Generate nginx configuration snippet
NGINX_CONFIG_FILE="$OUTPUT_DIR/nginx-vault-acme.conf"
cat > "$NGINX_CONFIG_FILE" << EOF
# Nginx configuration for Vault ACME certificates
# Include this in your nginx server block

# SSL certificate paths (will be created by ACME client)
ssl_certificate $(pwd)/vault-acme-certificate.pem;
ssl_certificate_key $(pwd)/vault-acme-private-key.pem;

# SSL configuration
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;

# ACME challenge location
location /.well-known/acme-challenge/ {
    root $(pwd)/public;
    try_files \$uri =404;
}
EOF
echo -e "${GREEN}✓ Created: $NGINX_CONFIG_FILE${NC}"

# Generate environment file
ENV_FILE="$OUTPUT_DIR/vault-acme.env"
cat > "$ENV_FILE" << EOF
# Vault ACME Environment Variables
# Source this file: source $ENV_FILE

export VAULT_ADDR="${VAULT_ADDR}"
export VAULT_TOKEN="${VAULT_TOKEN}"
export PKI_PATH="${PKI_PATH}"
export PKI_ROLE="${PKI_ROLE}"
export ACME_DIRECTORY_URL="${ACME_DIRECTORY_URL}"
export DOMAIN="${DOMAIN}"
EOF
echo -e "${GREEN}✓ Created: $ENV_FILE${NC}"

# Generate setup instructions
INSTRUCTIONS_FILE="$OUTPUT_DIR/SETUP-INSTRUCTIONS.md"
cat > "$INSTRUCTIONS_FILE" << EOF
# Vault ACME Setup Instructions

## Configuration Summary

- **Vault Address**: ${VAULT_ADDR}
- **PKI Path**: ${PKI_PATH}
- **PKI Role**: ${PKI_ROLE}
- **ACME Directory URL**: ${ACME_DIRECTORY_URL}
- **Domain**: ${DOMAIN}

## Files Generated

1. \`acme-client-config.json\` - ACME client configuration
2. \`nginx-vault-acme.conf\` - nginx configuration snippet
3. \`vault-acme.env\` - Environment variables
4. \`SETUP-INSTRUCTIONS.md\` - This file

## Quick Start

### 1. Update Application Configuration

Copy the ACME client configuration:

\`\`\`bash
cp $CLIENT_CONFIG_FILE ./acme-config.json
\`\`\`

### 2. Set Environment Variables

\`\`\`bash
source $ENV_FILE
\`\`\`

### 3. Start the Application

\`\`\`bash
npm start
\`\`\`

### 4. Obtain Certificate

Navigate to: http://localhost:3000/acme-config.html

The configuration will be pre-filled with Vault ACME settings.
Click "Obtain Certificate Now" to get your certificate from Vault.

### 5. Configure nginx (Optional)

If using nginx, update your nginx configuration:

\`\`\`bash
# Include the generated nginx config
sudo cp $NGINX_CONFIG_FILE /usr/local/etc/nginx/servers/
sudo nginx -t
sudo nginx -s reload
\`\`\`

## Vault ACME Endpoints

- **Directory**: ${ACME_DIRECTORY_URL}
- **New Nonce**: ${VAULT_ADDR}/v1/${PKI_PATH}/acme/new-nonce
- **New Account**: ${VAULT_ADDR}/v1/${PKI_PATH}/acme/new-account
- **New Order**: ${VAULT_ADDR}/v1/${PKI_PATH}/acme/new-order

## Testing ACME

Test the ACME directory endpoint:

\`\`\`bash
curl -k ${ACME_DIRECTORY_URL}
\`\`\`

Expected response:
\`\`\`json
{
  "newNonce": "${VAULT_ADDR}/v1/${PKI_PATH}/acme/new-nonce",
  "newAccount": "${VAULT_ADDR}/v1/${PKI_PATH}/acme/new-account",
  "newOrder": "${VAULT_ADDR}/v1/${PKI_PATH}/acme/new-order",
  ...
}
\`\`\`

## Certificate Management

### Manual Certificate Request

Using Vault CLI:

\`\`\`bash
vault write ${PKI_PATH}/issue/${PKI_ROLE} \\
    common_name="${DOMAIN}" \\
    ttl="720h"
\`\`\`

### List Certificates

\`\`\`bash
vault list ${PKI_PATH}/certs
\`\`\`

### Revoke Certificate

\`\`\`bash
vault write ${PKI_PATH}/revoke \\
    serial_number="<serial-number>"
\`\`\`

## Troubleshooting

### ACME Not Working

1. Verify ACME is enabled:
   \`\`\`bash
   vault read ${PKI_PATH}/config/acme
   \`\`\`

2. Check PKI role exists:
   \`\`\`bash
   vault read ${PKI_PATH}/roles/${PKI_ROLE}
   \`\`\`

3. Verify Vault is accessible:
   \`\`\`bash
   curl -k ${VAULT_ADDR}/v1/sys/health
   \`\`\`

### Certificate Issues

1. Check certificate validity:
   \`\`\`bash
   openssl x509 -in vault-acme-certificate.pem -text -noout
   \`\`\`

2. Verify private key:
   \`\`\`bash
   openssl rsa -in vault-acme-private-key.pem -check
   \`\`\`

## Security Notes

- Keep \`vault-acme.env\` secure (contains VAULT_TOKEN)
- Rotate Vault tokens regularly
- Use Vault policies to limit PKI access
- Monitor certificate expiration
- Enable Vault audit logging

## Additional Resources

- [Vault PKI Secrets Engine](https://www.vaultproject.io/docs/secrets/pki)
- [Vault ACME](https://www.vaultproject.io/docs/secrets/pki/acme)
- [ACME Protocol](https://tools.ietf.org/html/rfc8555)

## Support

For issues:
- Check Vault logs: \`vault audit list\`
- Verify PKI configuration: \`vault read ${PKI_PATH}/config/urls\`
- Test ACME endpoint: \`curl -k ${ACME_DIRECTORY_URL}\`
EOF
echo -e "${GREEN}✓ Created: $INSTRUCTIONS_FILE${NC}"

echo ""
echo -e "${GREEN}✅ Vault ACME setup complete!${NC}"
echo ""
echo "Configuration files created in: $OUTPUT_DIR"
echo ""
echo "Next steps:"
echo "  1. Review the setup instructions: cat $INSTRUCTIONS_FILE"
echo "  2. Copy client config: cp $CLIENT_CONFIG_FILE ./acme-config.json"
echo "  3. Source environment: source $ENV_FILE"
echo "  4. Start the application: npm start"
echo "  5. Navigate to: http://localhost:3000/acme-config.html"
echo ""
echo -e "${BLUE}ACME Directory URL: $ACME_DIRECTORY_URL${NC}"
echo ""

# Made with Bob
