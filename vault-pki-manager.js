const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

class VaultPkiManager {
    constructor(configPath = null) {
        const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        
        this.configPath = configPath || path.join(DATA_DIR, 'vault-pki-config.json');
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const config = JSON.parse(data);
                
                // Always refresh token from environment/file, never trust saved token
                const freshToken = this.getFreshToken();
                if (freshToken) {
                    config.vaultToken = freshToken;
                }
                
                return config;
            }
            return this.getDefaultConfig();
        } catch (error) {
            console.error('Error loading Vault PKI config:', error);
            return this.getDefaultConfig();
        }
    }

    // Helper method to get fresh token from file or environment
    // Priority: 1. Token file (written by vault-init), 2. Environment variable
    getFreshToken() {
        const VAULT_TOKEN_FILE = process.env.VAULT_TOKEN_FILE || '/vault-config/root-token.txt';
        let vaultToken = '';
        
        // First, try to read from file (most up-to-date from vault-init)
        try {
            if (fs.existsSync(VAULT_TOKEN_FILE)) {
                vaultToken = fs.readFileSync(VAULT_TOKEN_FILE, 'utf8').trim();
                if (vaultToken) {
                    console.log('Using Vault token from file:', VAULT_TOKEN_FILE);
                    return vaultToken;
                }
            }
        } catch (error) {
            console.error('Error reading Vault token file:', error);
        }
        
        // Fallback to environment variable
        vaultToken = process.env.VAULT_TOKEN || '';
        if (vaultToken) {
            console.log('Using Vault token from environment variable');
        }
        
        return vaultToken;
    }

    getDefaultConfig() {
        const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
        const CERT_DIR = process.env.CERT_DIR || path.join(__dirname, 'certs');
        const VAULT_ADDR = process.env.VAULT_ADDR || 'http://vault:8200';
        
        const vaultToken = this.getFreshToken();
        
        if (!vaultToken) {
            console.warn('WARNING: No Vault token found in environment or file');
        }
        
        return {
            vaultAddr: VAULT_ADDR,
            vaultToken: vaultToken,
            pkiPath: 'pki',
            roleName: 'localhost',
            commonName: 'localhost',
            certificatePath: path.join(CERT_DIR, 'fullchain.pem'),
            privateKeyPath: path.join(CERT_DIR, 'privkey.pem'),
            checkIntervalMinutes: 3
        };
    }

    saveConfig(newConfig) {
        try {
            // Merge new config with existing
            this.config = { ...this.config, ...newConfig };
            
            // Always refresh the token from environment/file before saving
            // This ensures we don't save a stale or empty token
            const freshToken = this.getFreshToken();
            if (freshToken) {
                this.config.vaultToken = freshToken;
            }
            
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('Vault PKI configuration saved with fresh token');
            return true;
        } catch (error) {
            console.error('Error saving Vault PKI config:', error);
            return false;
        }
    }

    // Make HTTP request to Vault
    async vaultRequest(method, path, data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.config.vaultAddr);
            const isHttps = url.protocol === 'https:';
            const httpModule = isHttps ? https : http;
            
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: path,
                method: method,
                headers: {
                    'X-Vault-Token': this.config.vaultToken,
                    'Content-Type': 'application/json'
                }
            };

            const req = httpModule.request(options, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(body || '{}'));
                        } catch (e) {
                            resolve({ statusCode: res.statusCode });
                        }
                    } else {
                        reject(new Error(`Vault API error: ${res.statusCode} - ${body}`));
                    }
                });
            });

            req.on('error', reject);

            if (data) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    // Issue a new certificate from Vault
    async obtainCertificate() {
        try {
            console.log('Requesting certificate from Vault PKI...');
            console.log('Common Name:', this.config.commonName);
            console.log('Role:', this.config.roleName);

            const issuePath = `/v1/${this.config.pkiPath}/issue/${this.config.roleName}`;
            const requestData = {
                common_name: this.config.commonName,
                ttl: '720h'
            };

            const response = await this.vaultRequest('POST', issuePath, requestData);

            if (!response.data) {
                throw new Error('No data in Vault response');
            }

            const { certificate, private_key, ca_chain } = response.data;

            // Combine certificate with CA chain for fullchain
            const fullchain = certificate + '\n' + (ca_chain ? ca_chain.join('\n') : '');

            // Save certificate and private key
            fs.writeFileSync(this.config.certificatePath, fullchain);
            fs.writeFileSync(this.config.privateKeyPath, private_key);

            console.log('Certificate saved to:', this.config.certificatePath);
            console.log('Private key saved to:', this.config.privateKeyPath);

            return {
                success: true,
                certificate: fullchain,
                privateKey: private_key
            };
        } catch (error) {
            console.error('Error obtaining certificate from Vault:', error);
            throw error;
        }
    }

    // Check if certificate exists
    certificateExists() {
        return fs.existsSync(this.config.certificatePath) && 
               fs.existsSync(this.config.privateKeyPath);
    }

    // Get certificate info
    getCertificateInfo() {
        try {
            if (!this.certificateExists()) {
                return null;
            }

            const certPem = fs.readFileSync(this.config.certificatePath, 'utf8');
            
            // Parse certificate dates (basic parsing)
            const notBeforeMatch = certPem.match(/Not Before: (.+)/);
            const notAfterMatch = certPem.match(/Not After : (.+)/);
            
            if (notAfterMatch) {
                const notAfter = new Date(notAfterMatch[1]);
                const now = new Date();
                const daysRemaining = Math.floor((notAfter - now) / (1000 * 60 * 60 * 24));
                
                return {
                    notAfter: notAfter.toISOString(),
                    daysRemaining: daysRemaining
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error reading certificate info:', error);
            return null;
        }
    }

    // Check if certificate needs renewal
    needsRenewal() {
        const certInfo = this.getCertificateInfo();
        if (!certInfo) return false;
        
        return certInfo.daysRemaining < 30;
    }

    // Get status
    getStatus() {
        const certInfo = this.getCertificateInfo();
        
        return {
            configured: !!this.config.vaultToken && !!this.config.commonName,
            certificateExists: this.certificateExists(),
            certificateInfo: certInfo,
            needsRenewal: this.needsRenewal()
        };
    }
}

module.exports = VaultPkiManager;

// Made with Bob
