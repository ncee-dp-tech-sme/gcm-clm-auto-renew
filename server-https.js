const express = require('express');
const https = require('https');
const http = require('http');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const VaultPkiManager = require('./vault-pki-manager');

const app = express();
let config = require('./config.json');

// Helper function to reload config from disk
function reloadConfig() {
    delete require.cache[require.resolve('./config.json')];
    config = require('./config.json');
    return config;
}

// Use /app/data for persistent storage in Docker, fallback to current directory
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const CERT_FILE = path.join(DATA_DIR, 'certificates.json');

// Initialize Vault PKI manager
const vaultPkiManager = new VaultPkiManager();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Serve .well-known directory for ACME challenges
app.use('/.well-known', express.static(path.join(__dirname, 'public', '.well-known')));

// Initialize certificates file if it doesn't exist
function initCertificatesFile() {
    if (!fs.existsSync(CERT_FILE)) {
        fs.writeFileSync(CERT_FILE, JSON.stringify({ certificates: [] }, null, 2));
        console.log('Created certificates.json file');
    }
}

// Read certificates from file
function readCertificates() {
    try {
        const data = fs.readFileSync(CERT_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading certificates file:', error);
        return { certificates: [] };
    }
}

// Write certificates to file
function writeCertificates(data) {
    try {
        fs.writeFileSync(CERT_FILE, JSON.stringify(data, null, 2));
        console.log('Certificates saved to file');
    } catch (error) {
        console.error('Error writing certificates file:', error);
    }
}

// Fetch certificate details from a URL
function fetchCertificate(url) {
    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname;
            const port = parsedUrl.port || 443;

            const options = {
                host: hostname,
                port: port,
                method: 'GET',
                rejectUnauthorized: false,
                agent: false
            };

            const req = https.request(options, (res) => {
                const cert = res.socket.getPeerCertificate(true);
                
                if (!cert || Object.keys(cert).length === 0) {
                    reject(new Error('No certificate found'));
                    return;
                }

                const certDetails = {
                    subject: {
                        commonName: cert.subject?.CN || 'N/A',
                        organization: cert.subject?.O || 'N/A',
                        organizationalUnit: cert.subject?.OU || 'N/A',
                        locality: cert.subject?.L || 'N/A',
                        state: cert.subject?.ST || 'N/A',
                        country: cert.subject?.C || 'N/A'
                    },
                    issuer: {
                        commonName: cert.issuer?.CN || 'N/A',
                        organization: cert.issuer?.O || 'N/A',
                        country: cert.issuer?.C || 'N/A'
                    },
                    validFrom: cert.valid_from,
                    validTo: cert.valid_to,
                    serialNumber: cert.serialNumber,
                    fingerprint: cert.fingerprint,
                    fingerprint256: cert.fingerprint256,
                    subjectAltNames: cert.subjectaltname || 'N/A',
                    bits: cert.bits,
                    exponent: cert.exponent,
                    pubkey: cert.pubkey ? cert.pubkey.toString('base64').substring(0, 50) + '...' : 'N/A',
                    fetchedAt: new Date().toISOString(),
                    url: url
                };

                resolve(certDetails);
                req.abort();
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.abort();
                reject(new Error('Request timeout'));
            });

            req.setTimeout(10000);
            req.end();

        } catch (error) {
            reject(error);
        }
    });
}

// Check if certificate has changed
function hasCertificateChanged(newCert, oldCert) {
    if (!oldCert) return true;
    
    return newCert.serialNumber !== oldCert.serialNumber ||
           newCert.fingerprint256 !== oldCert.fingerprint256 ||
           newCert.validFrom !== oldCert.validFrom ||
           newCert.validTo !== oldCert.validTo;
}

// Existing API endpoints (certificate monitoring)
app.get('/api/certificates', async (req, res) => {
    try {
        const data = readCertificates();
        res.json({
            success: true,
            certificates: data.certificates,
            targetUrl: config.targetUrl
        });
    } catch (error) {
        console.error('Error fetching certificates:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/check-certificate', async (req, res) => {
    try {
        // Reload config to get latest targetUrl
        reloadConfig();
        console.log(`Checking certificate for: ${config.targetUrl}`);
        const newCert = await fetchCertificate(config.targetUrl);
        const data = readCertificates();
        
        const lastCert = data.certificates.length > 0 ? data.certificates[0] : null;
        
        // Check if URL has changed by comparing the common name or subject
        const urlChanged = lastCert && (
            newCert.subject.commonName !== lastCert.subject.commonName ||
            newCert.issuer.commonName !== lastCert.issuer.commonName
        );
        
        if (urlChanged) {
            console.log('URL has changed - clearing old certificates and saving new one');
            data.certificates = [newCert];
            writeCertificates(data);
            
            res.json({
                success: true,
                changed: true,
                message: 'New URL detected - certificate saved',
                certificate: newCert,
                certificates: data.certificates
            });
        } else if (hasCertificateChanged(newCert, lastCert)) {
            console.log('Certificate has changed! Saving new certificate.');
            
            data.certificates.unshift(newCert);
            if (data.certificates.length > 2) {
                data.certificates = data.certificates.slice(0, 2);
            }
            
            writeCertificates(data);
            
            res.json({
                success: true,
                changed: true,
                message: 'New certificate detected and saved',
                certificate: newCert,
                certificates: data.certificates
            });
        } else {
            console.log('Certificate unchanged.');
            // Even though unchanged, update the first certificate with fresh data
            // This ensures the UI always shows current certificate details
            if (data.certificates.length > 0) {
                data.certificates[0] = newCert;
            } else {
                // If no certificates in storage, add the new one
                data.certificates.push(newCert);
            }
            
            res.json({
                success: true,
                changed: false,
                message: 'Certificate unchanged',
                certificate: newCert,
                certificates: data.certificates
            });
        }
    } catch (error) {
        console.error('Error checking certificate:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/config', (req, res) => {
    res.json({
        targetUrl: config.targetUrl,
        checkIntervalMinutes: config.checkIntervalMinutes
    });
});

app.post('/api/config', (req, res) => {
    try {
        const { targetUrl } = req.body;
        
        if (!targetUrl) {
            return res.status(400).json({
                success: false,
                error: 'Target URL is required'
            });
        }
        
        try {
            new URL(targetUrl);
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'Invalid URL format'
            });
        }
        
        if (!targetUrl.startsWith('https://')) {
            return res.status(400).json({
                success: false,
                error: 'URL must start with https://'
            });
        }
        
        config.targetUrl = targetUrl;
        fs.writeFileSync(
            path.join(__dirname, 'config.json'),
            JSON.stringify(config, null, 2)
        );
        
        console.log(`Target URL updated to: ${targetUrl}`);
        
        res.json({
            success: true,
            targetUrl: config.targetUrl
        });
    } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.delete('/api/certificates', (req, res) => {
    try {
        const data = { certificates: [] };
        writeCertificates(data);
        console.log('Certificate history cleared');
        
        res.json({
            success: true,
            message: 'Certificate history cleared'
        });
    } catch (error) {
        console.error('Error clearing certificates:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Vault PKI API endpoints
app.get('/api/acme/config', (req, res) => {
    try {
        const status = vaultPkiManager.getStatus();
        res.json({
            success: true,
            config: vaultPkiManager.config,
            status: status
        });
    } catch (error) {
        console.error('Error getting Vault PKI config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/acme/config', (req, res) => {
    try {
        const success = vaultPkiManager.saveConfig(req.body);
        
        if (success) {
            const status = vaultPkiManager.getStatus();
            res.json({
                success: true,
                config: vaultPkiManager.config,
                status: status
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to save configuration'
            });
        }
    } catch (error) {
        console.error('Error saving ACME config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/acme/test', async (req, res) => {
    try {
        const result = await vaultPkiManager.testConfiguration();
        res.json(result);
    } catch (error) {
        console.error('Error testing ACME config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/acme/obtain-certificate', async (req, res) => {
    try {
        console.log('Starting certificate obtainment...');
        const result = await vaultPkiManager.obtainCertificate();
        
        const status = vaultPkiManager.getStatus();
        
        res.json({
            success: true,
            message: 'Certificate obtained successfully',
            status: status
        });
        
        // Reload nginx to use new certificate
        setTimeout(() => {
            console.log('Reloading nginx...');
            const { exec } = require('child_process');
            exec('nginx -s reload', (error, stdout, stderr) => {
                if (error) {
                    console.error('Error reloading nginx:', error);
                } else {
                    console.log('Nginx reloaded successfully');
                }
            });
        }, 1000);
        
    } catch (error) {
        console.error('Error obtaining certificate:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/api/acme/retrieve-certificate', async (req, res) => {
    try {
        console.log('Retrieving certificate from Vault...');
        
        // Use the same obtainCertificate method - it will fetch the latest certificate from Vault
        const result = await vaultPkiManager.obtainCertificate();
        
        const status = vaultPkiManager.getStatus();
        
        res.json({
            success: true,
            message: 'Certificate retrieved and installed successfully',
            status: status
        });
        
        // Reload nginx to use the retrieved certificate
        setTimeout(() => {
            console.log('Reloading nginx...');
            const { exec } = require('child_process');
            exec('nginx -s reload', (error, stdout, stderr) => {
                if (error) {
                    console.error('Error reloading nginx:', error);
                } else {
                    console.log('Nginx reloaded successfully');
                }
            });
        }, 1000);
        
    } catch (error) {
        console.error('Error retrieving certificate:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Initialize and start server
initCertificatesFile();

const HTTP_PORT = config.port || 3000;
const HTTPS_PORT = 3443;

// Check if ACME certificates exist
const vaultConfig = vaultPkiManager.config;
const hasCertificates = vaultPkiManager.certificateExists();

if (hasCertificates) {
    // Start HTTPS server with ACME certificates
    try {
        const httpsOptions = {
            key: fs.readFileSync(vaultConfig.privateKeyPath),
            cert: fs.readFileSync(vaultConfig.certificatePath)
        };
        
        const httpsServer = https.createServer(httpsOptions, app);
        httpsServer.listen(HTTPS_PORT, () => {
            console.log(`✅ HTTPS Server running on https://localhost:${HTTPS_PORT}`);
            console.log(`Certificate common name: ${vaultConfig.commonName}`);
            const certInfo = vaultPkiManager.getCertificateInfo();
            if (certInfo) {
                console.log(`Certificate expires: ${certInfo.notAfter} (${certInfo.daysRemaining} days remaining)`);
            }
        });
        
        // Also start HTTP server for redirects and ACME challenges
        const httpServer = http.createServer(app);
        httpServer.listen(HTTP_PORT, () => {
            console.log(`HTTP Server running on http://localhost:${HTTP_PORT} (for ACME challenges)`);
        });
        
    } catch (error) {
        console.error('Error starting HTTPS server:', error);
        console.log('Falling back to HTTP only');
        startHttpOnly();
    }
} else {
    // Start HTTP only
    startHttpOnly();
}

function startHttpOnly() {
    const httpServer = http.createServer(app);
    httpServer.listen(HTTP_PORT, () => {
        console.log(`HTTP Server running on http://localhost:${HTTP_PORT}`);
        console.log(`Monitoring: ${config.targetUrl}`);
        console.log(`⚠️  No certificates found. Use Vault PKI to obtain certificates.`);
    });
}

// Automatic certificate check interval (only for renewal, not initial obtainment)
if (vaultConfig.checkIntervalMinutes > 0) {
    setInterval(async () => {
        try {
            console.log('\n--- Automatic Vault PKI certificate check ---');
            
            // Only attempt renewal if certificate exists
            if (vaultPkiManager.certificateExists()) {
                if (vaultPkiManager.needsRenewal()) {
                    console.log('Certificate needs renewal. Obtaining new certificate...');
                    await vaultPkiManager.obtainCertificate();
                    console.log('Certificate renewed successfully. Restart required.');
                    // In production, you would restart the server here
                } else {
                    console.log('Certificate is still valid.');
                }
            } else {
                console.log('No certificate found. Use the Vault PKI page to obtain one.');
            }
            
        } catch (error) {
            console.error('Error in automatic certificate check:', error.message);
        }
    }, vaultConfig.checkIntervalMinutes * 60 * 1000);
    
    console.log(`Certificate check interval: ${vaultConfig.checkIntervalMinutes} minutes`);
}

// Periodic certificate monitoring check (original feature)
if (config.checkIntervalMinutes > 0) {
    setInterval(async () => {
        try {
            console.log('\n--- Automatic certificate monitoring check ---');
            const newCert = await fetchCertificate(config.targetUrl);
            const data = readCertificates();
            const lastCert = data.certificates.length > 0 ? data.certificates[0] : null;
            
            if (hasCertificateChanged(newCert, lastCert)) {
                console.log('Monitored certificate has changed! Saving new certificate.');
                data.certificates.unshift(newCert);
                if (data.certificates.length > 2) {
                    data.certificates = data.certificates.slice(0, 2);
                }
                writeCertificates(data);
            } else {
                console.log('Monitored certificate unchanged.');
            }
        } catch (error) {
            console.error('Error in automatic monitoring check:', error.message);
        }
    }, config.checkIntervalMinutes * 60 * 1000);
}

// Made with Bob
