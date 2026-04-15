# ACME Certificate Management

This document describes the ACME (Automatic Certificate Management Environment) features added to the Certificate Monitor application.

## Overview

The application now supports automatic SSL/TLS certificate management using the ACME protocol (Let's Encrypt). This allows the application to:

- Automatically obtain SSL/TLS certificates
- Serve the application over HTTPS
- Automatically renew certificates before expiration
- Check for certificate updates every 3 minutes (configurable)

## Features

### 🔐 Automatic Certificate Obtainment
- Obtain certificates from Let's Encrypt (or any ACME-compatible CA)
- Support for both staging (testing) and production environments
- HTTP-01 and DNS-01 challenge types

### 🔄 Automatic Renewal
- Checks certificate status every 3 minutes (configurable)
- Automatically renews certificates when they have less than 30 days remaining
- Zero-downtime renewal process

### 🌐 HTTPS Server
- Automatically switches to HTTPS when certificates are available
- Falls back to HTTP if no certificates are present
- Serves HTTP on port 3000 for ACME challenges
- Serves HTTPS on port 3443

### ⚙️ Web-Based Configuration
- Configure ACME settings through a web interface
- Test configuration before obtaining certificates
- View certificate status and expiration dates

## Setup Instructions

### Prerequisites

1. **Domain Name**: You must have a domain name that points to your server's IP address
2. **Port Access**: 
   - Port 80 (HTTP) must be accessible for HTTP-01 challenges
   - Port 443 (HTTPS) recommended for production use
3. **DNS Configuration**: Your domain's A record must point to this server

### Initial Configuration

1. **Start the application**:
   ```bash
   npm start
   ```

2. **Access the ACME configuration page**:
   - Navigate to `http://your-server:3000/acme-config.html`

3. **Configure ACME settings**:
   - **Email**: Your email address (required for account notifications)
   - **Domain**: Your domain name (e.g., `example.com`)
   - **ACME Server**: Choose staging for testing, production for live certificates
   - **Challenge Type**: HTTP-01 (recommended) or DNS-01
   - **Check Interval**: How often to check for certificate updates (default: 3 minutes)

4. **Test configuration**:
   - Click "Test Configuration" to verify settings
   - Ensure your domain is properly configured

5. **Obtain certificate**:
   - Click "Obtain Certificate Now"
   - Wait for the process to complete (may take 1-2 minutes)
   - Server will automatically restart with HTTPS enabled

### Testing with Let's Encrypt Staging

**IMPORTANT**: Always test with Let's Encrypt Staging first!

Let's Encrypt has rate limits:
- 50 certificates per registered domain per week
- 5 duplicate certificates per week

Use staging environment for testing:
- URL: `https://acme-staging-v02.api.letsencrypt.org/directory`
- No rate limits
- Certificates are not trusted by browsers (expected)

Once testing is successful, switch to production:
- URL: `https://acme-v02.api.letsencrypt.org/directory`

## Configuration Files

### acme-config.json
Stores ACME configuration:
```json
{
  "email": "your-email@example.com",
  "domain": "example.com",
  "acmeDirectoryUrl": "https://acme-staging-v02.api.letsencrypt.org/directory",
  "challengeType": "http-01",
  "accountKeyPath": "./acme-account-key.pem",
  "certificatePath": "./acme-certificate.pem",
  "privateKeyPath": "./acme-private-key.pem",
  "checkIntervalMinutes": 3
}
```

**⚠️ SECURITY**: This file contains sensitive configuration. Keep it secure and never commit to version control.

### Generated Files

The following files are automatically generated:

- `acme-account-key.pem`: ACME account private key
- `acme-certificate.pem`: SSL/TLS certificate
- `acme-private-key.pem`: Certificate private key

**⚠️ CRITICAL**: These files contain sensitive cryptographic material. They are automatically excluded from git via `.gitignore`.

## API Endpoints

### GET /api/acme/config
Get current ACME configuration and status

**Response**:
```json
{
  "success": true,
  "config": { ... },
  "status": {
    "accountConfigured": true,
    "certificateObtained": true,
    "certificateInfo": {
      "domains": ["example.com"],
      "notBefore": "2024-01-01T00:00:00Z",
      "notAfter": "2024-04-01T00:00:00Z",
      "daysRemaining": 45
    }
  }
}
```

### POST /api/acme/config
Update ACME configuration

**Request**:
```json
{
  "email": "your-email@example.com",
  "domain": "example.com",
  "acmeDirectoryUrl": "https://acme-staging-v02.api.letsencrypt.org/directory",
  "challengeType": "http-01",
  "checkIntervalMinutes": 3
}
```

### POST /api/acme/test
Test ACME configuration

### POST /api/acme/obtain-certificate
Obtain a new certificate from the ACME server

## Automatic Certificate Renewal

The application automatically checks for certificate renewal every 3 minutes (configurable). Certificates are renewed when:

- Less than 30 days remain until expiration
- Certificate is invalid or missing

The renewal process:
1. Checks certificate status
2. If renewal needed, obtains new certificate
3. Logs the renewal (server restart may be required)

## Challenge Types

### HTTP-01 Challenge (Recommended)
- Requires port 80 to be accessible
- ACME server makes HTTP request to verify domain ownership
- Challenge files served from `/.well-known/acme-challenge/`
- Works for single domains

### DNS-01 Challenge
- Requires DNS API access
- ACME server checks DNS TXT records
- Works for wildcard certificates
- More complex setup

## Troubleshooting

### Certificate Obtainment Fails

1. **Check domain DNS**:
   ```bash
   nslookup your-domain.com
   ```
   Ensure it points to your server's IP

2. **Check port 80 accessibility**:
   ```bash
   curl http://your-domain.com/.well-known/acme-challenge/test
   ```

3. **Check logs**:
   - Server console shows detailed ACME process logs
   - Look for specific error messages

4. **Verify email format**:
   - Must be a valid email address
   - Used for important notifications

### Rate Limit Errors

If you hit Let's Encrypt rate limits:
- Wait for the rate limit window to reset (usually 1 week)
- Use staging environment for testing
- Consider using a different domain for testing

### Certificate Not Loading

1. **Check file permissions**:
   ```bash
   ls -la acme-*.pem
   ```
   Ensure files are readable

2. **Verify certificate validity**:
   ```bash
   openssl x509 -in acme-certificate.pem -text -noout
   ```

3. **Check server logs** for HTTPS startup errors

## Security Considerations

### Private Keys
- Never share or commit private keys
- Store securely with appropriate file permissions
- Rotate keys if compromised

### ACME Account
- Email address receives important notifications
- Keep account key secure
- Can be used to revoke certificates if needed

### Certificate Storage
- Certificates are stored in PEM format
- Private keys are never transmitted
- All ACME communication is over HTTPS

## Production Deployment

### Recommended Setup

1. **Use production ACME server**:
   - `https://acme-v02.api.letsencrypt.org/directory`

2. **Configure proper ports**:
   - HTTP: Port 80 (for ACME challenges)
   - HTTPS: Port 443 (standard HTTPS port)

3. **Set up process manager**:
   ```bash
   # Using PM2
   pm2 start server-https.js --name cert-monitor
   pm2 save
   pm2 startup
   ```

4. **Configure firewall**:
   ```bash
   # Allow HTTP and HTTPS
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

5. **Set up automatic restarts**:
   - Use PM2 or systemd for automatic restarts
   - Ensures server recovers after certificate renewal

### Monitoring

Monitor certificate status:
- Check ACME configuration page regularly
- Set up alerts for certificate expiration
- Monitor server logs for renewal attempts

## Support

For issues related to:
- **Let's Encrypt**: https://community.letsencrypt.org/
- **ACME Protocol**: https://tools.ietf.org/html/rfc8555
- **This Application**: Check server logs and GitHub issues

## References

- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [ACME Protocol Specification](https://tools.ietf.org/html/rfc8555)
- [acme-client Library](https://github.com/publishlab/node-acme-client)