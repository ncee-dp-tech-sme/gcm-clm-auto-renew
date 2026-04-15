#!/bin/bash

# Setup script for nginx with Certificate Monitor
# This script configures nginx to serve the certificate monitor application
# using certificates obtained from the ACME client

set -e

echo "🔧 Certificate Monitor - Nginx Setup Script"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NGINX_CONF="$SCRIPT_DIR/nginx.conf"

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}❌ nginx is not installed${NC}"
    echo ""
    echo "Please install nginx first:"
    echo "  macOS:   brew install nginx"
    echo "  Ubuntu:  sudo apt-get install nginx"
    echo "  CentOS:  sudo yum install nginx"
    exit 1
fi

echo -e "${GREEN}✓ nginx is installed${NC}"
NGINX_VERSION=$(nginx -v 2>&1 | cut -d'/' -f2)
echo "  Version: $NGINX_VERSION"
echo ""

# Check if ACME certificates exist
CERT_FILE="$SCRIPT_DIR/acme-certificate.pem"
KEY_FILE="$SCRIPT_DIR/acme-private-key.pem"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo -e "${YELLOW}⚠️  ACME certificates not found${NC}"
    echo ""
    echo "You need to obtain certificates first:"
    echo "  1. Start the application: npm start"
    echo "  2. Navigate to: http://localhost:3000/acme-config.html"
    echo "  3. Configure ACME settings"
    echo "  4. Click 'Obtain Certificate Now'"
    echo "  5. Run this script again"
    echo ""
    exit 1
fi

echo -e "${GREEN}✓ ACME certificates found${NC}"
echo "  Certificate: $CERT_FILE"
echo "  Private Key: $KEY_FILE"
echo ""

# Check certificate validity
CERT_EXPIRY=$(openssl x509 -in "$CERT_FILE" -noout -enddate 2>/dev/null | cut -d= -f2)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Certificate is valid${NC}"
    echo "  Expires: $CERT_EXPIRY"
else
    echo -e "${RED}❌ Certificate validation failed${NC}"
    exit 1
fi
echo ""

# Detect nginx configuration directory
if [ -d "/usr/local/etc/nginx" ]; then
    # macOS (Homebrew)
    NGINX_CONF_DIR="/usr/local/etc/nginx"
    NGINX_SITES_DIR="$NGINX_CONF_DIR/servers"
elif [ -d "/etc/nginx" ]; then
    # Linux
    NGINX_CONF_DIR="/etc/nginx"
    NGINX_SITES_DIR="$NGINX_CONF_DIR/sites-available"
else
    echo -e "${RED}❌ Could not find nginx configuration directory${NC}"
    exit 1
fi

echo -e "${GREEN}✓ nginx configuration directory found${NC}"
echo "  Config dir: $NGINX_CONF_DIR"
echo "  Sites dir: $NGINX_SITES_DIR"
echo ""

# Create sites directory if it doesn't exist
if [ ! -d "$NGINX_SITES_DIR" ]; then
    echo "Creating sites directory..."
    sudo mkdir -p "$NGINX_SITES_DIR"
fi

# Copy nginx configuration
DEST_CONF="$NGINX_SITES_DIR/cert-monitor.conf"
echo "Copying nginx configuration..."
sudo cp "$NGINX_CONF" "$DEST_CONF"
echo -e "${GREEN}✓ Configuration copied to: $DEST_CONF${NC}"
echo ""

# Update paths in configuration file
echo "Updating paths in configuration..."
sudo sed -i.bak "s|/Users/erwin/Documents/Projecten/Github_repos/personal_dev/ncee-dp-tech-sme/gcm-clm-auto-renew|$SCRIPT_DIR|g" "$DEST_CONF"
echo -e "${GREEN}✓ Paths updated${NC}"
echo ""

# Enable site (for Linux with sites-enabled)
if [ -d "$NGINX_CONF_DIR/sites-enabled" ]; then
    echo "Enabling site..."
    sudo ln -sf "$DEST_CONF" "$NGINX_CONF_DIR/sites-enabled/cert-monitor.conf"
    echo -e "${GREEN}✓ Site enabled${NC}"
    echo ""
fi

# For macOS, ensure the servers directory is included in nginx.conf
if [ -d "/usr/local/etc/nginx" ]; then
    if ! grep -q "include servers/\*;" "$NGINX_CONF_DIR/nginx.conf" 2>/dev/null; then
        echo "Adding include directive to nginx.conf..."
        sudo sed -i.bak '/http {/a\
    include servers/*;
' "$NGINX_CONF_DIR/nginx.conf"
        echo -e "${GREEN}✓ Include directive added${NC}"
        echo ""
    fi
fi

# Test nginx configuration
echo "Testing nginx configuration..."
if sudo nginx -t; then
    echo -e "${GREEN}✓ nginx configuration is valid${NC}"
    echo ""
else
    echo -e "${RED}❌ nginx configuration test failed${NC}"
    echo "Please check the configuration and try again"
    exit 1
fi

# Ask user if they want to restart nginx
echo -e "${YELLOW}Ready to restart nginx${NC}"
read -p "Do you want to restart nginx now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Restarting nginx..."
    if sudo nginx -s reload 2>/dev/null || sudo systemctl restart nginx 2>/dev/null || sudo service nginx restart 2>/dev/null; then
        echo -e "${GREEN}✓ nginx restarted successfully${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not restart nginx automatically${NC}"
        echo "Please restart nginx manually:"
        echo "  macOS:   sudo nginx -s reload"
        echo "  Linux:   sudo systemctl restart nginx"
    fi
fi

echo ""
echo -e "${GREEN}✅ Setup complete!${NC}"
echo ""
echo "Your certificate monitor is now available at:"
echo "  HTTP:  http://localhost (redirects to HTTPS)"
echo "  HTTPS: https://localhost"
echo ""
echo "To start the Node.js backend:"
echo "  npm start"
echo ""
echo "To check nginx status:"
echo "  macOS:   sudo nginx -t && ps aux | grep nginx"
echo "  Linux:   sudo systemctl status nginx"
echo ""
echo "Logs:"
echo "  Access: /usr/local/var/log/nginx/cert-monitor-access.log"
echo "  Error:  /usr/local/var/log/nginx/cert-monitor-error.log"
echo ""

# Made with Bob
