# Nginx Setup for Certificate Monitor

This document describes how to set up nginx as a reverse proxy for the Certificate Monitor application using ACME-obtained certificates.

## Overview

The nginx configuration provides:
- **Reverse Proxy**: Forwards requests to the Node.js backend
- **HTTPS Termination**: Handles SSL/TLS using ACME certificates
- **HTTP to HTTPS Redirect**: Automatically redirects HTTP traffic
- **ACME Challenge Support**: Serves ACME challenge files for certificate renewal
- **Security Headers**: Adds security headers to all responses
- **Static File Optimization**: Caches static assets for better performance

## Architecture

```
┌─────────┐     HTTPS      ┌─────────┐     HTTP      ┌──────────────┐
│ Browser │ ◄────────────► │  nginx  │ ◄───────────► │   Node.js    │
│         │   (Port 443)   │  Proxy  │  (Port 3000)  │   Backend    │
└─────────┘                └─────────┘               └──────────────┘
                                │
                                │ Uses certificates from
                                ▼
                         ┌──────────────┐
                         │ ACME Client  │
                         │ Certificates │
                         └──────────────┘
```

## Prerequisites

### 1. Install nginx

**macOS (Homebrew)**:
```bash
brew install nginx
```

**Ubuntu/Debian**:
```bash
sudo apt-get update
sudo apt-get install nginx
```

**CentOS/RHEL**:
```bash
sudo yum install nginx
```

### 2. Obtain ACME Certificates

Before setting up nginx, you need to obtain certificates:

1. Start the Node.js application:
   ```bash
   npm start
   ```

2. Navigate to the ACME configuration page:
   ```
   http://localhost:3000/acme-config.html
   ```

3. Configure ACME settings:
   - Email: your-email@example.com
   - Domain: localhost (or your domain)
   - ACME Server: Let's Encrypt Staging (for testing)

4. Click "Obtain Certificate Now"

5. Wait for the certificate to be obtained

The following files will be created:
- `acme-certificate.pem` - SSL/TLS certificate
- `acme-private-key.pem` - Private key
- `acme-account-key.pem` - ACME account key

## Quick Setup

### Automated Setup (Recommended)

Run the setup script:

```bash
./setup-nginx.sh
```

The script will:
1. Check if nginx is installed
2. Verify ACME certificates exist
3. Copy nginx configuration to the correct location
4. Update paths in the configuration
5. Test the configuration
6. Offer to restart nginx

### Manual Setup

If you prefer to set up manually:

1. **Copy the nginx configuration**:

   **macOS**:
   ```bash
   sudo cp nginx.conf /usr/local/etc/nginx/servers/cert-monitor.conf
   ```

   **Linux**:
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/cert-monitor.conf
   sudo ln -s /etc/nginx/sites-available/cert-monitor.conf /etc/nginx/sites-enabled/
   ```

2. **Update paths in the configuration**:

   Edit the configuration file and replace the paths with your actual project directory:
   ```bash
   sudo nano /usr/local/etc/nginx/servers/cert-monitor.conf  # macOS
   # or
   sudo nano /etc/nginx/sites-available/cert-monitor.conf    # Linux
   ```

   Update these lines:
   ```nginx
   root /path/to/your/project/public;
   ssl_certificate /path/to/your/project/acme-certificate.pem;
   ssl_certificate_key /path/to/your/project/acme-private-key.pem;
   ```

3. **Test the configuration**:
   ```bash
   sudo nginx -t
   ```

4. **Restart nginx**:

   **macOS**:
   ```bash
   sudo nginx -s reload
   ```

   **Linux**:
   ```bash
   sudo systemctl restart nginx
   ```

## Configuration Details

### Port Configuration

- **Port 80 (HTTP)**: 
  - Serves ACME challenges from `/.well-known/acme-challenge/`
  - Redirects all other traffic to HTTPS

- **Port 443 (HTTPS)**:
  - Serves the application over HTTPS
  - Proxies requests to Node.js backend on port 3000

### SSL/TLS Configuration

The configuration uses:
- **Protocols**: TLSv1.2 and TLSv1.3
- **Ciphers**: High-security ciphers only
- **Session Cache**: 10MB shared cache
- **Session Timeout**: 10 minutes

### Security Headers

The following security headers are added:
- `Strict-Transport-Security`: Forces HTTPS for 1 year
- `X-Frame-Options`: Prevents clickjacking
- `X-Content-Type-Options`: Prevents MIME sniffing
- `X-XSS-Protection`: Enables XSS filter

### Proxy Configuration

Requests are proxied to the Node.js backend with:
- HTTP/1.1 protocol
- Proper headers for real IP and forwarding
- 60-second timeouts
- Connection upgrade support (for WebSockets if needed)

## Usage

### Starting the Services

1. **Start the Node.js backend**:
   ```bash
   npm start
   ```

2. **Ensure nginx is running**:

   **macOS**:
   ```bash
   sudo nginx
   # or if already running:
   sudo nginx -s reload
   ```

   **Linux**:
   ```bash
   sudo systemctl start nginx
   # or
   sudo systemctl restart nginx
   ```

### Accessing the Application

- **HTTP**: http://localhost (redirects to HTTPS)
- **HTTPS**: https://localhost

### Checking Status

**nginx status**:
```bash
# macOS
ps aux | grep nginx

# Linux
sudo systemctl status nginx
```

**Test configuration**:
```bash
sudo nginx -t
```

**View logs**:
```bash
# Access log
tail -f /usr/local/var/log/nginx/cert-monitor-access.log

# Error log
tail -f /usr/local/var/log/nginx/cert-monitor-error.log
```

## Certificate Renewal

When the ACME client renews certificates:

1. New certificates are written to the same files
2. nginx needs to reload to use the new certificates
3. Reload nginx without downtime:
   ```bash
   sudo nginx -s reload
   ```

### Automatic Reload on Certificate Renewal

You can set up a cron job or systemd timer to reload nginx after certificate renewal:

**Cron example** (check every hour):
```bash
0 * * * * /usr/bin/test -f /path/to/project/acme-certificate.pem && /usr/sbin/nginx -s reload
```

## Troubleshooting

### nginx won't start

1. **Check configuration**:
   ```bash
   sudo nginx -t
   ```

2. **Check if port 80/443 is already in use**:
   ```bash
   sudo lsof -i :80
   sudo lsof -i :443
   ```

3. **Check nginx error log**:
   ```bash
   tail -f /usr/local/var/log/nginx/error.log
   ```

### Certificate errors

1. **Verify certificate files exist**:
   ```bash
   ls -la acme-certificate.pem acme-private-key.pem
   ```

2. **Check certificate validity**:
   ```bash
   openssl x509 -in acme-certificate.pem -text -noout
   ```

3. **Verify file permissions**:
   ```bash
   chmod 644 acme-certificate.pem
   chmod 600 acme-private-key.pem
   ```

### 502 Bad Gateway

This means nginx can't connect to the Node.js backend:

1. **Check if Node.js is running**:
   ```bash
   ps aux | grep node
   ```

2. **Verify Node.js is listening on port 3000**:
   ```bash
   lsof -i :3000
   ```

3. **Check Node.js logs** for errors

### ACME challenges not working

1. **Verify challenge directory exists**:
   ```bash
   ls -la public/.well-known/acme-challenge/
   ```

2. **Check nginx can access the directory**:
   ```bash
   sudo -u nginx ls public/.well-known/acme-challenge/
   ```

3. **Test challenge URL**:
   ```bash
   curl http://localhost/.well-known/acme-challenge/test
   ```

## Production Considerations

### For Production Deployment

1. **Use a real domain name** instead of localhost
2. **Update server_name** in nginx.conf:
   ```nginx
   server_name yourdomain.com www.yourdomain.com;
   ```

3. **Use Let's Encrypt Production** instead of staging
4. **Set up automatic certificate renewal**
5. **Configure firewall** to allow ports 80 and 443
6. **Use a process manager** (PM2, systemd) for Node.js
7. **Set up monitoring** for nginx and Node.js

### Performance Tuning

For high-traffic sites, consider:
- Increasing worker processes
- Enabling gzip compression
- Setting up caching
- Using HTTP/2 push
- Configuring rate limiting

### Security Hardening

Additional security measures:
- Disable nginx version in headers
- Set up fail2ban for brute force protection
- Configure CSP headers
- Enable OCSP stapling
- Set up log rotation

## References

- [nginx Documentation](https://nginx.org/en/docs/)
- [nginx Reverse Proxy Guide](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)
- [SSL/TLS Best Practices](https://wiki.mozilla.org/Security/Server_Side_TLS)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)

## Support

For issues:
- Check nginx error logs
- Verify certificate files exist and are valid
- Ensure Node.js backend is running
- Test nginx configuration with `nginx -t`