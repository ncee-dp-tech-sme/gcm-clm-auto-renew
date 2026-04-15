const express = require('express');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const app = express();
const config = require('./config.json');
const CERT_FILE = path.join(__dirname, 'certificates.json');

// Middleware
app.use(express.json());
app.use(express.static('public'));

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
                rejectUnauthorized: false, // Allow self-signed certificates
                agent: false
            };

            const req = https.request(options, (res) => {
                const cert = res.socket.getPeerCertificate(true);
                
                if (!cert || Object.keys(cert).length === 0) {
                    reject(new Error('No certificate found'));
                    return;
                }

                // Extract certificate details
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

// API endpoint to get certificates
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

// API endpoint to check and update certificate
app.post('/api/check-certificate', async (req, res) => {
    try {
        console.log(`Checking certificate for: ${config.targetUrl}`);
        const newCert = await fetchCertificate(config.targetUrl);
        const data = readCertificates();
        
        // Get the most recent certificate
        const lastCert = data.certificates.length > 0 ? data.certificates[0] : null;
        
        // Check if certificate has changed
        if (hasCertificateChanged(newCert, lastCert)) {
            console.log('Certificate has changed! Saving new certificate.');
            
            // Keep only the last 2 certificates (current and previous)
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

// API endpoint to get configuration
app.get('/api/config', (req, res) => {
    res.json({
        targetUrl: config.targetUrl,
        checkIntervalMinutes: config.checkIntervalMinutes
    });
});

// API endpoint to update configuration
app.post('/api/config', (req, res) => {
    try {
        const { targetUrl } = req.body;
        
        if (!targetUrl) {
            return res.status(400).json({
                success: false,
                error: 'Target URL is required'
            });
        }
        
        // Validate URL
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
        
        // Update config
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

// API endpoint to delete certificates (clear history)
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

// Initialize and start server
initCertificatesFile();

const PORT = config.port || 3000;
app.listen(PORT, () => {
    console.log(`Certificate Monitor running on http://localhost:${PORT}`);
    console.log(`Monitoring: ${config.targetUrl}`);
    console.log(`Check interval: ${config.checkIntervalMinutes} minutes`);
});

// Periodic certificate check (optional)
if (config.checkIntervalMinutes > 0) {
    setInterval(async () => {
        try {
            console.log('\n--- Automatic certificate check ---');
            const newCert = await fetchCertificate(config.targetUrl);
            const data = readCertificates();
            const lastCert = data.certificates.length > 0 ? data.certificates[0] : null;
            
            if (hasCertificateChanged(newCert, lastCert)) {
                console.log('Certificate has changed! Saving new certificate.');
                data.certificates.unshift(newCert);
                if (data.certificates.length > 2) {
                    data.certificates = data.certificates.slice(0, 2);
                }
                writeCertificates(data);
            } else {
                console.log('Certificate unchanged.');
            }
        } catch (error) {
            console.error('Error in automatic check:', error.message);
        }
    }, config.checkIntervalMinutes * 60 * 1000);
}

// Made with Bob
