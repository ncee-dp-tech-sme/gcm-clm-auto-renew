# HashiCorp Vault ACME Integration

This document describes how to integrate the Certificate Monitor application with HashiCorp Vault's ACME support for enterprise-grade certificate management.

## Overview

HashiCorp Vault provides an ACME server implementation through its PKI secrets engine. This allows you to:

- Use Vault as your internal Certificate Authority
- Obtain certificates via the ACME protocol
- Centralize certificate management
- Integrate with existing Vault infrastructure
- Maintain audit trails of certificate operations

## Architecture

```
┌─────────────┐     ACME      ┌──────────────┐     Vault API    ┌─────────────┐
│ Certificate │ ◄───────────► │    Vault     │ ◄──────────────► │   Vault     │
│   Monitor   │   Protocol    │ ACME Server  │                  │ PKI Engine  │
│ Application │               │              │                  │             │
└─────────────┘               └──────────────┘                  └─────────────┘
       │                              │                                 │
       │ Uses certificates            │ Issues certificates             │
       ▼                              ▼                                 ▼
┌─────────────┐               ┌──────────────┐                  ┌─────────────┐
│    nginx    │               │   Root CA    │                  │  Policies   │
│   Server    │               │ Certificate  │                  │   & Roles   │
└─────────────┘               └──────────────┘                  └─────────────┘
```

## Prerequisites

### 1. HashiCorp Vault

**Installation**:

**macOS**:
```bash
brew install vault
```

**Linux**:
```bash
# Download from https://www.vaultproject.io/downloads
wget https://releases.hashicorp.com/vault/1.15.0/vault_1.15.0_linux_amd64.zip
unzip vault_1.15.0_linux_amd64.zip
sudo mv vault /usr/local/bin/
```

**Verify installation**:
```bash
vault version
```

### 2. Running Vault Server

**Development Mode** (for testing):
```bash
vault server -dev
```

**Production Mode**:
```bash
# Create config file
cat > vault-config.hcl << EOF
storage "file" {
  path = "/opt/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}

api_addr = "http://127.0.0.1:8200"
ui = true
EOF

# Start Vault
vault server -config=vault-config.hcl
```

### 3. Initialize and Unseal Vault

```bash
# Initialize (first time only)
vault operator init

# Unseal (required after each restart)
vault operator unseal <unseal-key-1>
vault operator unseal <unseal-key-2>
vault operator unseal <unseal-key-3>

# Login
vault login <root-token>
```

## Quick Setup

### Automated Setup (Recommended)

Run the Vault ACME setup script:

```bash
./setup-vault-acme.sh
```

**With custom options**:
```bash
./setup-vault-acme.sh \
  --vault-addr http://vault.example.com:8200 \
  --pki-path pki \
  --role acme-role \
  --domain example.com \
  --output-dir ./vault-config
```

The script will:
1. ✅ Check Vault CLI installation
2. ✅ Test Vault connection
3. ✅ Enable PKI secrets engine (if needed)
4. ✅ Generate root CA (if needed)
5. ✅ Configure CA and CRL URLs
6. ✅ Create PKI role
7. ✅ Enable ACME
8. ✅ Generate client configuration files

### Manual Setup

If you prefer manual setup:

#### 1. Enable PKI Secrets Engine

```bash
vault secrets enable pki
vault secrets tune -max-lease-ttl=87600h pki
```

#### 2. Generate Root CA

```bash
vault write -field=certificate pki/root/generate/internal \
    common_name="My Root CA" \
    ttl=87600h > CA_cert.crt
```

#### 3. Configure CA and CRL URLs

```bash
vault write pki/config/urls \
    issuing_certificates="http://127.0.0.1:8200/v1/pki/ca" \
    crl_distribution_points="http://127.0.0.1:8200/v1/pki/crl"
```

#### 4. Create PKI Role

```bash
vault write pki/roles/acme-role \
    allowed_domains="example.com" \
    allow_subdomains=true \
    allow_localhost=true \
    allow_bare_domains=true \
    allow_ip_sans=true \
    max_ttl="720h" \
    ttl="720h"
```

#### 5. Enable ACME

```bash
vault write pki/config/acme \
    enabled=true \
    allowed_roles="acme-role" \
    allowed_issuers="*" \
    default_directory_policy="sign-verbatim"
```

## Configuration Files Generated

After running `setup-vault-acme.sh`, the following files are created in `vault-acme-config/`:

### 1. acme-client-config.json

ACME client configuration for the application:

```json
{
  "email": "admin@example.com",
  "domain": "example.com",
  "acmeDirectoryUrl": "http://127.0.0.1:8200/v1/pki/acme/directory",
  "challengeType": "http-01",
  "accountKeyPath": "./vault-acme-account-key.pem",
  "certificatePath": "./vault-acme-certificate.pem",
  "privateKeyPath": "./vault-acme-private-key.pem",
  "checkIntervalMinutes": 3,
  "vaultConfig": {
    "vaultAddr": "http://127.0.0.1:8200",
    "pkiPath": "pki",
    "pkiRole": "acme-role"
  }
}
```

### 2. nginx-vault-acme.conf

nginx configuration snippet:

```nginx
ssl_certificate /path/to/vault-acme-certificate.pem;
ssl_certificate_key /path/to/vault-acme-private-key.pem;

ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
```

### 3. vault-acme.env

Environment variables:

```bash
export VAULT_ADDR="http://127.0.0.1:8200"
export VAULT_TOKEN="<your-token>"
export PKI_PATH="pki"
export PKI_ROLE="acme-role"
export ACME_DIRECTORY_URL="http://127.0.0.1:8200/v1/pki/acme/directory"
```

### 4. SETUP-INSTRUCTIONS.md

Detailed setup instructions and troubleshooting guide.

## Using Vault ACME with the Application

### 1. Copy Configuration

```bash
cp vault-acme-config/acme-client-config.json ./acme-config.json
```

### 2. Set Environment Variables

```bash
source vault-acme-config/vault-acme.env
```

### 3. Start the Application

```bash
npm start
```

### 4. Configure ACME

Navigate to: `https://localhost/acme-config.html`

For direct backend access during development, you can also use: `http://localhost:3000/acme-config.html`

The configuration will be pre-filled with Vault ACME settings. Click "Obtain Certificate Now".

### 5. Verify Certificate

```bash
# Check certificate
openssl x509 -in vault-acme-certificate.pem -text -noout

# Verify it's from Vault
openssl x509 -in vault-acme-certificate.pem -noout -issuer
```

## Vault ACME Endpoints

Vault exposes standard ACME endpoints:

- **Directory**: `http://vault:8200/v1/pki/acme/directory`
- **New Nonce**: `http://vault:8200/v1/pki/acme/new-nonce`
- **New Account**: `http://vault:8200/v1/pki/acme/new-account`
- **New Order**: `http://vault:8200/v1/pki/acme/new-order`
- **Revoke Certificate**: `http://vault:8200/v1/pki/acme/revoke-cert`

## Certificate Management

### List Certificates

```bash
vault list pki/certs
```

### Read Certificate

```bash
vault read pki/cert/<serial-number>
```

### Revoke Certificate

```bash
vault write pki/revoke serial_number="<serial-number>"
```

### Issue Certificate Manually

```bash
vault write pki/issue/acme-role \
    common_name="example.com" \
    ttl="720h"
```

## Vault Policies

### Create ACME Policy

```bash
vault policy write acme-policy - << EOF
# Allow ACME operations
path "pki/acme/*" {
  capabilities = ["create", "read", "update"]
}

# Allow certificate issuance
path "pki/issue/acme-role" {
  capabilities = ["create", "update"]
}

# Allow certificate reading
path "pki/cert/*" {
  capabilities = ["read"]
}
EOF
```

### Create Token with Policy

```bash
vault token create -policy=acme-policy
```

## Integration with nginx

### Update nginx Configuration

```bash
# Copy the generated nginx config
sudo cp vault-acme-config/nginx-vault-acme.conf /usr/local/etc/nginx/servers/

# Test configuration
sudo nginx -t

# Reload nginx
sudo nginx -s reload
```

### Automatic Certificate Renewal

The application automatically renews certificates every 3 minutes. To reload nginx after renewal:

```bash
# Add to crontab
*/3 * * * * /usr/sbin/nginx -s reload
```

## Monitoring and Auditing

### Enable Audit Logging

```bash
vault audit enable file file_path=/var/log/vault-audit.log
```

### View Audit Logs

```bash
tail -f /var/log/vault-audit.log | jq
```

### Monitor Certificate Expiration

```bash
# Check certificate expiration
vault read pki/cert/<serial> | jq -r '.data.certificate' | \
  openssl x509 -noout -enddate
```

## Troubleshooting

### ACME Not Enabled

**Check ACME configuration**:
```bash
vault read pki/config/acme
```

**Enable ACME**:
```bash
vault write pki/config/acme enabled=true
```

### Certificate Issuance Fails

**Check PKI role**:
```bash
vault read pki/roles/acme-role
```

**Verify domain is allowed**:
```bash
vault write pki/roles/acme-role \
    allowed_domains="your-domain.com" \
    allow_subdomains=true
```

### Connection Issues

**Test Vault connectivity**:
```bash
curl -k http://127.0.0.1:8200/v1/sys/health
```

**Check ACME directory**:
```bash
curl -k http://127.0.0.1:8200/v1/pki/acme/directory
```

### Token Expired

**Create new token**:
```bash
vault token create -policy=acme-policy -ttl=720h
```

**Update environment**:
```bash
export VAULT_TOKEN="<new-token>"
```

## Security Best Practices

### 1. Use Vault Policies

Create specific policies for ACME operations:
- Limit access to PKI paths
- Use short-lived tokens
- Implement least privilege

### 2. Enable TLS

Configure Vault with TLS:
```hcl
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_cert_file = "/path/to/cert.pem"
  tls_key_file  = "/path/to/key.pem"
}
```

### 3. Rotate Root CA

Periodically rotate the root CA:
```bash
vault write pki/root/rotate/internal \
    common_name="New Root CA"
```

### 4. Monitor Access

- Enable audit logging
- Review certificate issuance
- Monitor for anomalies

### 5. Backup Vault Data

```bash
# Backup Vault data directory
tar -czf vault-backup-$(date +%Y%m%d).tar.gz /opt/vault/data
```

## Production Deployment

### High Availability Setup

```hcl
storage "consul" {
  address = "127.0.0.1:8500"
  path    = "vault/"
}

ha_storage "consul" {
  address = "127.0.0.1:8500"
  path    = "vault/"
}
```

### Load Balancing

Use a load balancer for Vault ACME endpoints:
```
https://vault-lb.example.com/v1/pki/acme/directory
```

### Monitoring

Set up monitoring for:
- Vault health
- Certificate expiration
- ACME request rates
- Failed authentications

## Comparison: Vault vs Let's Encrypt

| Feature | Vault ACME | Let's Encrypt |
|---------|------------|---------------|
| Internal CA | ✅ Yes | ❌ No |
| Rate Limits | ✅ Configurable | ⚠️ Fixed limits |
| Audit Logs | ✅ Built-in | ❌ No |
| Custom Policies | ✅ Yes | ❌ No |
| Offline Operation | ✅ Yes | ❌ Requires internet |
| Enterprise Support | ✅ Available | ❌ Community only |
| Cost | 💰 License required | ✅ Free |

## References

- [Vault PKI Secrets Engine](https://www.vaultproject.io/docs/secrets/pki)
- [Vault ACME Documentation](https://www.vaultproject.io/docs/secrets/pki/acme)
- [ACME Protocol RFC](https://tools.ietf.org/html/rfc8555)
- [Vault Best Practices](https://learn.hashicorp.com/tutorials/vault/production-hardening)

## Support

For issues:
- Check Vault logs: `vault audit list`
- Verify PKI configuration: `vault read pki/config/urls`
- Test ACME endpoint: `curl http://vault:8200/v1/pki/acme/directory`
- Review audit logs: `tail -f /var/log/vault-audit.log`