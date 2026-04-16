const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

class VaultPkiManager {
    constructor(configPath = null) {
        const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        
        this.configPath = configPath || path.join(DATA_DIR, 'vault-pki-config.json');
        this.defaultConfigPath = path.join(DATA_DIR, 'vault-pki-config.default.json');
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const config = JSON.parse(data);
                
                if (!config.vaultToken) {
                    config.vaultToken = this.getExternalToken();
                }
                
                return config;
            }
            return this.getDefaultConfig();
        } catch (error) {
            console.error('Error loading Vault PKI config:', error);
            return this.getDefaultConfig();
        }
    }

    getVaultCredentialPaths() {
        return {
            tokenFile: process.env.VAULT_TOKEN_FILE || '/vault-config/root-token.txt',
            unsealFile: process.env.VAULT_UNSEAL_FILE || '/vault-config/unseal-key.txt',
            initKeysFile: process.env.VAULT_INIT_KEYS_FILE || '/vault-config/init-keys.json'
        };
    }

    readFileIfExists(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                return fs.readFileSync(filePath, 'utf8').trim();
            }
        } catch (error) {
            console.error(`Error reading file ${filePath}:`, error);
        }
        return '';
    }

    getExternalUnsealToken() {
        const { unsealFile, initKeysFile } = this.getVaultCredentialPaths();

        const unsealTokenFromFile = this.readFileIfExists(unsealFile);
        if (unsealTokenFromFile) {
            console.log('Using Vault unseal token from file:', unsealFile);
            return unsealTokenFromFile;
        }

        try {
            if (fs.existsSync(initKeysFile)) {
                const initKeys = JSON.parse(fs.readFileSync(initKeysFile, 'utf8'));
                const unsealToken = Array.isArray(initKeys.unseal_keys_b64) ? initKeys.unseal_keys_b64[0] : '';
                if (unsealToken) {
                    console.log('Using Vault unseal token from init keys file:', initKeysFile);
                    return unsealToken;
                }
            }
        } catch (error) {
            console.error('Error reading Vault init keys file:', error);
        }

        return process.env.VAULT_UNSEAL_TOKEN || '';
    }

    // Helper method to get token from file or environment
    // Priority: 1. Token file (written by vault-init), 2. Environment variable
    getExternalToken() {
        const { tokenFile, initKeysFile } = this.getVaultCredentialPaths();
        let vaultToken = this.readFileIfExists(tokenFile);
        
        if (vaultToken) {
            console.log('Using Vault token from file:', tokenFile);
            return vaultToken;
        }

        try {
            if (fs.existsSync(initKeysFile)) {
                const initKeys = JSON.parse(fs.readFileSync(initKeysFile, 'utf8'));
                vaultToken = initKeys.root_token || '';
                if (vaultToken) {
                    console.log('Using Vault token from init keys file:', initKeysFile);
                    return vaultToken;
                }
            }
        } catch (error) {
            console.error('Error reading Vault init keys file:', error);
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
        
        const vaultToken = this.getExternalToken();
        
        if (!vaultToken) {
            console.warn('WARNING: No Vault token found in environment or file');
        }
        
        return {
            vaultAddr: VAULT_ADDR,
            vaultToken: vaultToken,
            vaultUnsealToken: this.getExternalUnsealToken(),
            pkiPath: 'pki',
            roleName: 'localhost',
            commonName: 'localhost',
            certificatePath: path.join(CERT_DIR, 'fullchain.pem'),
            privateKeyPath: path.join(CERT_DIR, 'privkey.pem'),
            checkIntervalMinutes: 3
        };
    }

    isDefaultVaultConfig(config = this.config) {
        const defaultConfig = this.getDefaultConfig();
        return (
            (config.vaultAddr || '') === (defaultConfig.vaultAddr || '') &&
            (config.pkiPath || '') === (defaultConfig.pkiPath || '') &&
            (config.roleName || '') === (defaultConfig.roleName || '') &&
            (config.commonName || '') === (defaultConfig.commonName || '')
        );
    }

    backupDefaultConfigIfNeeded() {
        try {
            if (fs.existsSync(this.defaultConfigPath)) {
                return;
            }

            fs.writeFileSync(this.defaultConfigPath, JSON.stringify(this.config, null, 2));
            console.log('Saved default Vault PKI config backup');
        } catch (error) {
            console.error('Error saving default Vault PKI config backup:', error);
        }
    }

    restoreDefaultConfig() {
        try {
            let restoredConfig;

            if (fs.existsSync(this.defaultConfigPath)) {
                restoredConfig = JSON.parse(fs.readFileSync(this.defaultConfigPath, 'utf8'));
            } else {
                restoredConfig = this.getDefaultConfig();
            }

            if (!restoredConfig.vaultToken) {
                restoredConfig.vaultToken = this.getExternalToken();
            }

            this.config = restoredConfig;
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('Vault PKI configuration restored to default');
            return true;
        } catch (error) {
            console.error('Error restoring default Vault PKI config:', error);
            return false;
        }
    }

    saveConfig(newConfig) {
        try {
            const sanitizedConfig = { ...newConfig };
            
            if (sanitizedConfig.vaultAddr) {
                const parsedVaultUrl = new URL(sanitizedConfig.vaultAddr);
                if (!['http:', 'https:'].includes(parsedVaultUrl.protocol)) {
                    throw new Error('Vault address must start with http:// or https://');
                }
                sanitizedConfig.vaultAddr = sanitizedConfig.vaultAddr.trim();
            }

            if (sanitizedConfig.pkiPath) {
                sanitizedConfig.pkiPath = sanitizedConfig.pkiPath.trim().replace(/^\/+|\/+$/g, '');
            }

            if (sanitizedConfig.roleName) {
                sanitizedConfig.roleName = sanitizedConfig.roleName.trim();
            }

            if (sanitizedConfig.commonName) {
                sanitizedConfig.commonName = sanitizedConfig.commonName.trim();
            }

            if (Object.prototype.hasOwnProperty.call(sanitizedConfig, 'vaultToken')) {
                sanitizedConfig.vaultToken = sanitizedConfig.vaultToken.trim();
            }

            const nextConfig = { ...this.config, ...sanitizedConfig };
            
            if (!this.isDefaultVaultConfig(nextConfig)) {
                this.backupDefaultConfigIfNeeded();
            }

            // Merge new config with existing
            this.config = nextConfig;
            
            if (!this.config.vaultToken) {
                this.config.vaultToken = this.getExternalToken();
            }
            
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('Vault PKI configuration saved');
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

    ensureCertificateDirectories() {
        fs.mkdirSync(path.dirname(this.config.certificatePath), { recursive: true });
        fs.mkdirSync(path.dirname(this.config.privateKeyPath), { recursive: true });
    }

    buildFullchain(certificate, issuingCa = null, caChain = null) {
        const chainParts = [];

        if (Array.isArray(caChain) && caChain.length > 0) {
            chainParts.push(...caChain.filter(Boolean));
        } else if (issuingCa) {
            chainParts.push(issuingCa);
        }

        return [certificate, ...chainParts].filter(Boolean).join('\n');
    }

    writeCertificateFiles(certificatePem, privateKeyPem, issuingCa = null, caChain = null) {
        this.ensureCertificateDirectories();

        const fullchain = this.buildFullchain(certificatePem, issuingCa, caChain);

        fs.writeFileSync(this.config.certificatePath, fullchain);
        fs.writeFileSync(this.config.privateKeyPath, privateKeyPem);

        try {
            fs.chmodSync(this.config.privateKeyPath, 0o600);
        } catch (error) {
            console.warn('Warning: unable to set private key permissions:', error.message);
        }

        console.log('Certificate saved to:', this.config.certificatePath);
        console.log('Private key saved to:', this.config.privateKeyPath);

        return fullchain;
    }

    getInstalledCertificateFingerprint() {
        try {
            if (!this.certificateExists()) {
                return null;
            }

            const output = execFileSync('openssl', ['x509', '-in', this.config.certificatePath, '-noout', '-fingerprint', '-sha256'], {
                encoding: 'utf8'
            }).trim();

            const match = output.match(/Fingerprint=([A-F0-9:]+)/i);
            return match ? match[1].replace(/:/g, '').toUpperCase() : null;
        } catch (error) {
            console.error('Error reading installed certificate fingerprint:', error.message);
            return null;
        }
    }

    getVaultIssuedCertificates() {
        return this.vaultRequest('LIST', `/v1/${this.config.pkiPath}/certs`);
    }

    normalizeFingerprint(value) {
        if (!value) {
            return null;
        }
        return String(value).replace(/[^A-Fa-f0-9]/g, '').toUpperCase();
    }

    parsePemBundle(pemText) {
        const matches = String(pemText || '').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
        return matches || [];
    }

    getCertificateFingerprintFromPem(pemText) {
        try {
            const output = execFileSync('openssl', ['x509', '-noout', '-fingerprint', '-sha256'], {
                input: pemText,
                encoding: 'utf8'
            }).trim();

            const match = output.match(/Fingerprint=([A-F0-9:]+)/i);
            return match ? this.normalizeFingerprint(match[1]) : null;
        } catch (error) {
            console.error('Error calculating fingerprint from PEM:', error.message);
            return null;
        }
    }

    getLatestVaultCertificate() {
        return new Promise(async (resolve, reject) => {
            try {
                const listed = await this.getVaultIssuedCertificates();
                const keys = listed?.data?.keys || [];

                if (!keys.length) {
                    resolve(null);
                    return;
                }

                const certificateDetails = [];
                for (const serial of keys) {
                    try {
                        const certResponse = await this.vaultRequest('GET', `/v1/${this.config.pkiPath}/cert/${serial}`);
                        if (certResponse?.data?.certificate) {
                            const pemBlocks = this.parsePemBundle(certResponse.data.certificate);
                            const leafPem = pemBlocks[0] || certResponse.data.certificate;
                            const chainPem = pemBlocks.slice(1);
                            certificateDetails.push({
                                serial,
                                certificatePem: leafPem,
                                chainPem,
                                certificate: certResponse.data.certificate,
                                privateKey: null,
                                commonName: certResponse.data.common_name || certResponse.data.subject || '',
                                expiry: certResponse.data.expiration ? Number(certResponse.data.expiration) : 0,
                                fingerprint: this.getCertificateFingerprintFromPem(leafPem)
                            });
                        }
                    } catch (error) {
                        console.warn(`Unable to read Vault certificate ${serial}:`, error.message);
                    }
                }

                const filtered = certificateDetails.filter(cert =>
                    cert.commonName && cert.commonName.includes(this.config.commonName)
                );

                const candidates = filtered.length ? filtered : certificateDetails;
                candidates.sort((a, b) => (b.expiry || 0) - (a.expiry || 0));

                resolve(candidates[0] || null);
            } catch (error) {
                reject(error);
            }
        });
    }

    // Issue a new certificate from Vault and install it
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

            const { certificate, private_key, ca_chain, issuing_ca, serial_number } = response.data;

            if (!certificate || !private_key) {
                throw new Error('Vault did not return certificate and private key');
            }

            const fullchain = this.writeCertificateFiles(certificate, private_key, issuing_ca, ca_chain);

            return {
                success: true,
                action: 'obtained',
                serialNumber: serial_number || null,
                certificate: fullchain,
                privateKey: private_key
            };
        } catch (error) {
            console.error('Error obtaining certificate from Vault:', error);
            throw error;
        }
    }

    // Retrieve latest available certificate from Vault and install it if newer
    async retrieveLatestCertificate() {
        try {
            console.log('Checking Vault for latest available certificate...');
            const latestVaultCert = await this.getLatestVaultCertificate();

            if (!latestVaultCert) {
                return {
                    success: true,
                    action: 'none',
                    changed: false,
                    message: 'No issued certificate found in Vault for retrieval'
                };
            }

            if (!latestVaultCert.certificatePem) {
                throw new Error('Latest Vault certificate does not include certificate PEM data');
            }

            const installedFingerprint = this.getInstalledCertificateFingerprint();
            const latestFingerprint = this.normalizeFingerprint(latestVaultCert.fingerprint);

            if (installedFingerprint && latestFingerprint && installedFingerprint === latestFingerprint) {
                return {
                    success: true,
                    action: 'retrieved',
                    changed: false,
                    message: 'Installed certificate is already the latest available certificate',
                    serialNumber: latestVaultCert.serial
                };
            }

            if (!this.config.privateKeyPath || !fs.existsSync(this.config.privateKeyPath)) {
                throw new Error('Cannot install retrieved certificate because the existing private key is missing');
            }

            const existingPrivateKey = fs.readFileSync(this.config.privateKeyPath, 'utf8');
            const fullchain = this.writeCertificateFiles(
                latestVaultCert.certificatePem,
                existingPrivateKey,
                null,
                latestVaultCert.chainPem
            );

            return {
                success: true,
                action: 'retrieved',
                changed: true,
                message: 'Latest Vault certificate retrieved and installed successfully',
                serialNumber: latestVaultCert.serial,
                certificate: fullchain
            };
        } catch (error) {
            console.error('Error retrieving latest certificate from Vault:', error);
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
            configured: !!this.config.vaultToken && !!this.config.commonName && !!this.config.vaultAddr && !!this.config.roleName,
            certificateExists: this.certificateExists(),
            certificateInfo: certInfo,
            needsRenewal: this.needsRenewal(),
            isDefaultConfig: this.isDefaultVaultConfig(),
            hasDefaultBackup: fs.existsSync(this.defaultConfigPath)
        };
    }
}

module.exports = VaultPkiManager;

// Made with Bob
