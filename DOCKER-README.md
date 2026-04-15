# Docker Deployment Guide

This guide explains how to deploy the Certificate Monitor application using Docker.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Vault Integration](#vault-integration)
- [Volumes and Persistence](#volumes-and-persistence)
- [Networking](#networking)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

## Overview

The Docker deployment packages the entire Certificate Monitor application, including:
- Node.js application server
- nginx reverse proxy
- ACME client for certificate management
- All necessary dependencies

The application runs in a single container using supervisord to manage both nginx and Node.js processes.

## Prerequisites

- Docker Engine 20.10 or later
- Docker Compose 2.0 or later (optional, but recommended)
- External Vault server (if using Vault ACME integration)

## Quick Start

### Using Docker Compose (Recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ncee-dp-tech-sme/gcm-clm-auto-renew.git
   cd gcm-clm-auto-renew
   ```

2. **Configure environment variables:**
   Create a `.env` file in the project root:
   ```env
   VAULT_ADDR=http://your-vault-server:8200
   VAULT_TOKEN=your-vault-token
   ```

3. **Build and start the container:**
   ```bash
   docker-compose up -d
   ```

4. **Access the application:**
   - HTTP: http://localhost
   - HTTPS UI: https://localhost
   - Direct Node.js backend: http://localhost:3000

### Using Docker CLI

1. **Build the image:**
   ```bash
   docker build -t cert-monitor:latest .
   ```

2. **Run the container:**
   ```bash
   docker run -d \
     --name cert-monitor \
     -p 80:80 \
     -p 443:443 \
     -p 3000:3000 \
     -e VAULT_ADDR=http://your-vault-server:8200 \
     -e VAULT_TOKEN=your-vault-token \
     -v cert-data:/app/certs \
     -v app-data:/app/data \
     cert-monitor:latest
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Node.js environment | `production` |
| `PORT` | Node.js application port | `3000` |
| `VAULT_ADDR` | Vault server address | `http://vault:8200` |
| `VAULT_TOKEN` | Vault authentication token | (empty) |

### Application Configuration

The application uses configuration files that can be modified before building the image:

- **config.json**: Main application configuration
  ```json
  {
    "targetUrl": "https://example.com",
    "port": 3000,
    "checkInterval": 180000
  }
  ```

- **acme-config.json**: ACME client configuration (created at runtime)

## Vault Integration

### External Vault Server

The Docker deployment is designed to connect to an external Vault server. The Vault server should be configured with:

1. **PKI Secrets Engine** enabled
2. **ACME protocol** enabled
3. **Appropriate roles and policies** configured

Refer to `VAULT-ACME-README.md` for detailed Vault setup instructions.

### Connecting to Vault

Set the Vault address and token in your environment:

```bash
export VAULT_ADDR=http://your-vault-server:8200
export VAULT_TOKEN=your-vault-token
docker-compose up -d
```

Or use a `.env` file:

```env
VAULT_ADDR=http://vault.example.com:8200
VAULT_TOKEN=hvs.CAESIJ...
```

### Optional: Running Vault in Docker

If you want to run Vault in the same Docker network for testing, uncomment the Vault service in `docker-compose.yml`:

```yaml
vault:
  image: hashicorp/vault:latest
  container_name: vault
  ports:
    - "8200:8200"
  environment:
    - VAULT_DEV_ROOT_TOKEN_ID=root
    - VAULT_DEV_LISTEN_ADDRESS=0.0.0.0:8200
  cap_add:
    - IPC_LOCK
  networks:
    - cert-monitor-network
  command: server -dev
```

**Note:** This runs Vault in development mode and should NOT be used in production.

## Volumes and Persistence

The Docker deployment uses named volumes to persist data:

### Volume Mounts

| Volume | Container Path | Purpose |
|--------|---------------|---------|
| `cert-data` | `/app/certs` | SSL/TLS certificates |
| `app-data` | `/app/data` | Application data (configs, history) |
| `nginx-logs` | `/var/log/nginx` | nginx access and error logs |
| `supervisor-logs` | `/var/log/supervisor` | Supervisor process logs |

### Backing Up Data

To backup certificate and application data:

```bash
# Backup certificates
docker run --rm -v cert-data:/data -v $(pwd):/backup alpine tar czf /backup/certs-backup.tar.gz -C /data .

# Backup application data
docker run --rm -v app-data:/data -v $(pwd):/backup alpine tar czf /backup/app-data-backup.tar.gz -C /data .
```

### Restoring Data

```bash
# Restore certificates
docker run --rm -v cert-data:/data -v $(pwd):/backup alpine tar xzf /backup/certs-backup.tar.gz -C /data

# Restore application data
docker run --rm -v app-data:/data -v $(pwd):/backup alpine tar xzf /backup/app-data-backup.tar.gz -C /data
```

## Networking

### Port Mappings

- **Port 80**: HTTP traffic (redirects to HTTPS)
- **Port 443**: HTTPS traffic (nginx reverse proxy)
- **Port 3000**: Direct Node.js application access

### Custom Network

The Docker Compose setup creates a custom bridge network (`cert-monitor-network`) for service communication.

### Accessing from Host

All services are accessible from the host machine using `localhost`:
- http://localhost
- https://localhost
- http://localhost:3000

Use `https://localhost` as the standard UI entrypoint.

### Accessing from Other Containers

Other containers in the same network can access the service using the container name:
- http://cert-monitor
- https://cert-monitor

## Troubleshooting

### View Logs

```bash
# All logs
docker-compose logs -f

# Specific service logs
docker exec cert-monitor tail -f /var/log/supervisor/nodejs.log
docker exec cert-monitor tail -f /var/log/nginx/access.log
docker exec cert-monitor tail -f /var/log/nginx/error.log
```

### Check Container Status

```bash
docker-compose ps
docker-compose exec cert-monitor supervisorctl status
```

### Health Check

```bash
curl http://localhost:3000/health
```

### Common Issues

#### 1. Certificate Errors on First Start

**Problem:** Browser shows certificate warning on first access.

**Solution:** The container creates self-signed certificates on first start. Configure ACME to obtain valid certificates:
1. Access the UI at https://localhost
2. Open the ACME configuration page at https://localhost/acme-config.html
3. Configure ACME settings
4. Obtain certificate

#### 2. Cannot Connect to Vault

**Problem:** Application cannot connect to Vault server.

**Solution:** 
- Verify `VAULT_ADDR` is correct
- Ensure Vault server is accessible from the container
- Check Vault token is valid
- Verify network connectivity: `docker exec cert-monitor curl $VAULT_ADDR/v1/sys/health`

#### 3. nginx Configuration Errors

**Problem:** nginx fails to start.

**Solution:**
```bash
# Test nginx configuration
docker exec cert-monitor nginx -t

# Check nginx logs
docker exec cert-monitor cat /var/log/nginx/error.log
```

#### 4. Permission Issues

**Problem:** Application cannot write to data directories.

**Solution:**
```bash
# Fix permissions
docker exec cert-monitor chown -R appuser:appuser /app/data
docker exec cert-monitor chown -R appuser:appuser /app/certs
```

### Restart Services

```bash
# Restart all services
docker-compose restart

# Restart specific service
docker exec cert-monitor supervisorctl restart nodejs
docker exec cert-monitor supervisorctl restart nginx
```

## Advanced Usage

### Custom nginx Configuration

To use a custom nginx configuration:

1. Create your custom config file
2. Mount it as a volume:
   ```yaml
   volumes:
     - ./my-nginx.conf:/etc/nginx/http.d/default.conf:ro
   ```
3. Restart the container

### Running Commands in Container

```bash
# Interactive shell
docker exec -it cert-monitor /bin/bash

# Run as appuser
docker exec -it -u appuser cert-monitor /bin/bash

# Execute Node.js script
docker exec cert-monitor node /app/your-script.js
```

### Building for Different Architectures

```bash
# Build for ARM64 (Apple Silicon, Raspberry Pi)
docker buildx build --platform linux/arm64 -t cert-monitor:arm64 .

# Build for AMD64 (Intel/AMD)
docker buildx build --platform linux/amd64 -t cert-monitor:amd64 .

# Multi-platform build
docker buildx build --platform linux/amd64,linux/arm64 -t cert-monitor:latest .
```

### Production Deployment

For production deployment:

1. **Use specific image tags:**
   ```bash
   docker build -t cert-monitor:1.0.0 .
   ```

2. **Set resource limits:**
   ```yaml
   services:
     cert-monitor:
       deploy:
         resources:
           limits:
             cpus: '1.0'
             memory: 512M
           reservations:
             cpus: '0.5'
             memory: 256M
   ```

3. **Use secrets for sensitive data:**
   ```yaml
   services:
     cert-monitor:
       secrets:
         - vault_token
   
   secrets:
     vault_token:
       file: ./vault_token.txt
   ```

4. **Enable automatic restarts:**
   ```yaml
   services:
     cert-monitor:
       restart: always
   ```

5. **Use external Vault server** (never run Vault in dev mode in production)

6. **Configure proper logging:**
   ```yaml
   services:
     cert-monitor:
       logging:
         driver: "json-file"
         options:
           max-size: "10m"
           max-file: "3"
   ```

### Monitoring

Monitor container health and performance:

```bash
# Container stats
docker stats cert-monitor

# Health check status
docker inspect --format='{{.State.Health.Status}}' cert-monitor

# Process list
docker exec cert-monitor ps aux
```

## Security Considerations

1. **Never expose port 3000 in production** - use nginx reverse proxy only
2. **Use strong Vault tokens** and rotate them regularly
3. **Keep Docker images updated** - rebuild regularly with latest base images
4. **Use read-only volumes** where possible
5. **Run with minimal privileges** - the application runs as non-root user `appuser`
6. **Secure Vault communication** - use TLS for Vault connections in production
7. **Review logs regularly** for security events

## Additional Resources

- [Main README](README.md) - Application overview and features
- [ACME README](ACME-README.md) - ACME protocol and Let's Encrypt integration
- [nginx README](NGINX-README.md) - nginx configuration and setup
- [Vault ACME README](VAULT-ACME-README.md) - Vault PKI and ACME integration
- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review application logs
3. Consult the relevant README files
4. Check Docker and container logs