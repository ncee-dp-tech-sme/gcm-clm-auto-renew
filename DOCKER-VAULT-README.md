# Docker Deployment with Integrated Vault

This guide explains how to deploy the Certificate Monitor application with an integrated HashiCorp Vault server running in Docker.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Vault ACME Setup](#vault-acme-setup)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)
- [Production Considerations](#production-considerations)

## Overview

The integrated Docker deployment includes:
- **cert-monitor**: Main application container (Node.js + nginx)
- **vault**: HashiCorp Vault server in development mode
- **vault-init**: One-time initialization container that configures Vault PKI and ACME

This setup is ideal for:
- Local development and testing
- Learning ACME protocol with Vault
- Proof-of-concept deployments
- Environments where you want a self-contained solution

⚠️ **Important**: The Vault server runs in development mode and should NOT be used in production.

## Quick Start

### 1. Start All Services

```bash
# Clone the repository
git clone <repository-url>
cd gcm-clm-auto-renew

# Start all services
docker-compose up -d

# Check service status
docker-compose ps
```

### 2. Verify Vault Initialization

```bash
# Check vault-init logs
docker-compose logs vault-init

# You should see:
# ===================================
# Vault ACME Configuration Complete!
# ===================================
```

### 3. Access the Application

- **Certificate Monitor**: https://localhost
- **Vault UI**: http://localhost:8200/ui (Token: `root`)
- **Direct Node.js**: http://localhost:3000

### 4. Configure ACME

1. Navigate to http://localhost:3000/acme-config.html
2. The form should be pre-filled with Vault ACME settings:
   - Email: `admin@localhost`
   - Domain: `localhost`
   - ACME Directory URL: `http://vault:8200/v1/pki/acme/directory`
3. Click "Save Configuration"
4. Click "Obtain Certificate"

The application will automatically obtain a certificate from Vault and configure nginx to use it.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Network                           │
│                                                              │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │              │      │              │                    │
│  │  Vault       │◄─────┤  Vault-Init  │ (runs once)       │
│  │  Server      │      │  Container   │                    │
│  │              │      │              │                    │
│  │  Port: 8200  │      └──────────────┘                    │
│  │              │                                           │
│  └──────┬───────┘                                           │
│         │                                                   │
│         │ ACME Protocol                                     │
│         │                                                   │
│  ┌──────▼───────────────────────────────────────┐          │
│  │  Certificate Monitor Container               │          │
│  │                                               │          │
│  │  ┌─────────┐         ┌──────────────┐       │          │
│  │  │  nginx  │◄────────┤  Node.js App │       │          │
│  │  │  :443   │         │  :3000       │       │          │
│  │  └─────────┘         └──────────────┘       │          │
│  │                                               │          │
│  └───────────────────────────────────────────────┘          │
│         │                                                   │
└─────────┼───────────────────────────────────────────────────┘
          │
          ▼
    User Browser
```

## Configuration

### Environment Variables

The docker-compose.yml uses these environment variables (can be set in `.env` file):

```env
# Vault Configuration
VAULT_ADDR=http://vault:8200
VAULT_TOKEN=root

# Node.js Configuration
NODE_ENV=production
PORT=3000
```

### Vault Development Mode

The Vault server runs in development mode with:
- Root token: `root`
- In-memory storage (data lost on restart)
- TLS disabled
- Single unsealed instance

### Persistent Data

The following volumes persist data across container restarts:

| Volume | Purpose |
|--------|---------|
| `cert-data` | SSL/TLS certificates |
| `app-data` | Application data and configs |
| `vault-data` | Vault data (dev mode uses memory) |
| `vault-config` | Vault initialization artifacts |
| `nginx-logs` | nginx logs |
| `supervisor-logs` | Supervisor logs |
| `vault-logs` | Vault logs |

## Vault ACME Setup

### Automatic Initialization

The `vault-init` container automatically:

1. **Enables PKI Secrets Engine** at `pki/`
2. **Generates Root CA** with 10-year validity
3. **Configures CA URLs** for certificate issuance
4. **Creates PKI Role** for localhost domains
5. **Enables ACME Protocol** on the PKI engine
6. **Generates ACME Config** for the cert-monitor app

### Manual Verification

Check Vault configuration:

```bash
# Access Vault container
docker exec -it vault sh

# Set Vault address and token
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=root

# List secrets engines
vault secrets list

# Check PKI configuration
vault read pki/config/urls

# Verify ACME is enabled
vault read pki/config/acme

# Test ACME directory endpoint
vault read pki/acme/directory
```

### Root CA Certificate

The root CA certificate is saved to `/vault-config/root_ca.crt` and can be extracted:

```bash
# Copy root CA from container
docker cp vault-init:/vault-config/root_ca.crt ./root_ca.crt

# View certificate details
openssl x509 -in root_ca.crt -text -noout
```

To trust this CA in your browser:
1. Import `root_ca.crt` into your browser's certificate store
2. Mark it as trusted for identifying websites

## Usage

### Obtaining Certificates

#### Via Web Interface

1. Navigate to http://localhost:3000/acme-config.html
2. Configuration should be pre-filled
3. Click "Obtain Certificate"
4. Monitor the status messages
5. Once complete, access https://localhost

#### Via API

```bash
# Get current ACME configuration
curl http://localhost:3000/api/acme/config

# Obtain certificate
curl -X POST http://localhost:3000/api/acme/obtain

# Check certificate status
curl http://localhost:3000/api/acme/status
```

### Certificate Renewal

Certificates are automatically checked every 3 minutes. To manually trigger renewal:

```bash
curl -X POST http://localhost:3000/api/acme/renew
```

### Monitoring Certificates

The main page shows certificate details and history:

```bash
# View in browser
open https://localhost

# Or via API
curl http://localhost:3000/api/certificates
```

## Troubleshooting

### Vault Not Ready

**Problem**: cert-monitor fails to start because Vault is not ready.

**Solution**: The docker-compose includes health checks and dependencies. Wait for all services to be healthy:

```bash
docker-compose ps
# All services should show "healthy" status
```

### ACME Certificate Acquisition Fails

**Problem**: Cannot obtain certificate from Vault ACME.

**Diagnosis**:
```bash
# Check Vault logs
docker-compose logs vault

# Check vault-init logs
docker-compose logs vault-init

# Check cert-monitor logs
docker-compose logs cert-monitor

# Verify ACME endpoint
docker exec vault vault read pki/acme/directory
```

**Common Issues**:
1. Vault not fully initialized - wait for vault-init to complete
2. Network connectivity - ensure containers are on same network
3. ACME not enabled - check vault-init logs for errors

### Certificate Not Trusted by Browser

**Problem**: Browser shows certificate warning.

**Solution**: 
1. Extract root CA: `docker cp vault-init:/vault-config/root_ca.crt ./`
2. Import into browser/system trust store
3. Restart browser

### Vault Data Lost on Restart

**Expected Behavior**: Vault runs in dev mode with in-memory storage. Data is lost on restart.

**Solution**: For persistent data, use Vault in production mode (see Production Considerations).

### Port Conflicts

**Problem**: Ports 80, 443, 3000, or 8200 already in use.

**Solution**: Modify port mappings in docker-compose.yml:

```yaml
services:
  cert-monitor:
    ports:
      - "8080:80"      # HTTP
      - "8443:443"     # HTTPS
      - "3001:3000"    # Node.js
  
  vault:
    ports:
      - "8201:8200"    # Vault
```

## Production Considerations

⚠️ **This setup is NOT production-ready**. For production:

### 1. Use Production Vault

Replace dev mode Vault with production configuration:

```yaml
vault:
  image: hashicorp/vault:latest
  volumes:
    - ./vault-config.hcl:/vault/config/vault.hcl:ro
    - vault-data:/vault/data
  environment:
    - VAULT_ADDR=https://vault:8200
  command: server
  # Remove dev mode settings
```

### 2. Enable TLS

- Use real TLS certificates for Vault
- Configure mutual TLS between services
- Use HTTPS for all communication

### 3. Secure Vault Access

- Use proper authentication methods (AppRole, Kubernetes, etc.)
- Implement least-privilege policies
- Rotate tokens regularly
- Never use root token in production

### 4. Use External Vault

For production, use an external Vault cluster:

```yaml
services:
  cert-monitor:
    environment:
      - VAULT_ADDR=https://vault.production.example.com:8200
      - VAULT_TOKEN=${VAULT_TOKEN}  # From secure secret store
    # Remove vault and vault-init services
```

### 5. Persistent Storage

- Use proper volume drivers for production
- Implement backup strategies
- Consider using managed services

### 6. Monitoring and Logging

- Implement centralized logging
- Set up monitoring and alerting
- Use log aggregation services

### 7. High Availability

- Run multiple instances behind load balancer
- Use Vault in HA mode
- Implement proper health checks

## Stopping and Cleaning Up

### Stop Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes all data)
docker-compose down -v
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f cert-monitor
docker-compose logs -f vault
docker-compose logs -f vault-init
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart cert-monitor
```

## Additional Resources

- [Main README](README.md) - Application overview
- [Docker README](DOCKER-README.md) - General Docker deployment
- [Vault ACME README](VAULT-ACME-README.md) - Vault ACME integration details
- [ACME README](ACME-README.md) - ACME protocol information
- [HashiCorp Vault Documentation](https://www.vaultproject.io/docs)
- [ACME Protocol RFC 8555](https://tools.ietf.org/html/rfc8555)

## Support

For issues specific to this Docker setup:
1. Check service logs: `docker-compose logs`
2. Verify service health: `docker-compose ps`
3. Review this documentation
4. Check the main README and other documentation files