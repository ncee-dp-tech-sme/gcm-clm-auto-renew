const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const IS_PKG = typeof process.pkg !== 'undefined';
const PUBLIC_DIR = IS_PKG ? path.join(path.dirname(process.execPath), 'public') : path.join(__dirname, 'public');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CERTIFICATES_FILE = path.join(DATA_DIR, 'certificates.json');

const DEFAULT_CONFIG = {
  targetUrl: 'https://localhost'
};

const CERTIFICATE_COMPARISON_FIELDS = [
  ['subject.commonName', 'Subject Common Name'],
  ['subject.organization', 'Subject Organization'],
  ['subject.organizationalUnit', 'Subject Organizational Unit'],
  ['subject.locality', 'Subject Locality'],
  ['subject.state', 'Subject State'],
  ['subject.country', 'Subject Country'],
  ['issuer.commonName', 'Issuer Common Name'],
  ['issuer.organization', 'Issuer Organization'],
  ['issuer.country', 'Issuer Country'],
  ['validFrom', 'Valid From'],
  ['validTo', 'Valid To'],
  ['serialNumber', 'Serial Number'],
  ['fingerprint256', 'SHA-256 Fingerprint'],
  ['fingerprint', 'SHA-1 Fingerprint'],
  ['subjectAltNames', 'Subject Alt Names'],
  ['url', 'URL'],
  ['fetchedAt', 'Fetched At']
];

fs.mkdirSync(DATA_DIR, { recursive: true });

function ensureConfigFile() {
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
}

function ensureCertificatesFile() {
  if (!fs.existsSync(CERTIFICATES_FILE)) {
    fs.writeFileSync(CERTIFICATES_FILE, JSON.stringify({ certificates: [] }, null, 2));
  }
}

function readConfig() {
  ensureConfigFile();
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading config file:', error);
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function readCertificates() {
  ensureCertificatesFile();
  try {
    return JSON.parse(fs.readFileSync(CERTIFICATES_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading certificates file:', error);
    return { certificates: [] };
  }
}

function writeCertificates(data) {
  fs.writeFileSync(CERTIFICATES_FILE, JSON.stringify(data, null, 2));
}

function buildCertDetails(cert, url) {
  return {
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
    url
  };
}

function fetchCertificate(url) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;
      const port = parsedUrl.port || 443;
      const isLocalhost = hostname === 'localhost';
      const connectionHosts = isLocalhost ? ['127.0.0.1', '::1'] : [hostname];

      let lastError = null;

      const tryConnection = (index) => {
        if (index >= connectionHosts.length) {
          reject(lastError || new Error('Unable to connect to target host'));
          return;
        }

        const connectHost = connectionHosts[index];
        const options = {
          host: connectHost,
          servername: hostname,
          port,
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

          resolve(buildCertDetails(cert, url));
          req.destroy();
        });

        req.on('error', (error) => {
          lastError = error;

          if (isLocalhost && ['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(error.code)) {
            tryConnection(index + 1);
            return;
          }

          reject(error);
        });

        req.on('timeout', () => {
          req.destroy();
          lastError = new Error('Request timeout');

          if (isLocalhost) {
            tryConnection(index + 1);
            return;
          }

          reject(lastError);
        });

        req.setTimeout(10000);
        req.end();
      };

      tryConnection(0);
    } catch (error) {
      reject(error);
    }
  });
}

function hasCertificateChanged(newCert, oldCert) {
  if (!oldCert) {
    return true;
  }

  return newCert.serialNumber !== oldCert.serialNumber ||
    newCert.fingerprint256 !== oldCert.fingerprint256 ||
    newCert.validFrom !== oldCert.validFrom ||
    newCert.validTo !== oldCert.validTo;
}

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok' });
});

app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

app.post('/api/config', (req, res) => {
  try {
    const { targetUrl } = req.body;

    if (!targetUrl) {
      return res.status(400).json({ success: false, error: 'Target URL is required' });
    }

    try {
      new URL(targetUrl);
    } catch (error) {
      return res.status(400).json({ success: false, error: 'Invalid URL format' });
    }

    if (!targetUrl.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'URL must start with https://' });
    }

    const config = readConfig();
    config.targetUrl = targetUrl;
    writeConfig(config);

    res.json({ success: true, targetUrl: config.targetUrl });
  } catch (error) {
    console.error('Error updating config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/certificates', (req, res) => {
  try {
    const data = readCertificates();
    const config = readConfig();

    res.json({
      success: true,
      certificates: data.certificates,
      targetUrl: config.targetUrl,
      comparisonFields: CERTIFICATE_COMPARISON_FIELDS
    });
  } catch (error) {
    console.error('Error fetching certificates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/check-certificate', async (req, res) => {
  try {
    const config = readConfig();
    const newCert = await fetchCertificate(config.targetUrl);
    const data = readCertificates();
    const lastCert = data.certificates.length > 0 ? data.certificates[0] : null;

    const urlChanged = lastCert && (
      newCert.subject.commonName !== lastCert.subject.commonName ||
      newCert.issuer.commonName !== lastCert.issuer.commonName
    );

    if (urlChanged) {
      data.certificates = [newCert];
    } else if (hasCertificateChanged(newCert, lastCert)) {
      data.certificates.unshift(newCert);
      if (data.certificates.length > 2) {
        data.certificates = data.certificates.slice(0, 2);
      }
    } else if (data.certificates.length > 0) {
      data.certificates[0] = newCert;
    } else {
      data.certificates.push(newCert);
    }

    writeCertificates(data);

    res.json({
      success: true,
      changed: !lastCert || urlChanged || hasCertificateChanged(newCert, lastCert),
      certificate: newCert,
      certificates: data.certificates
    });
  } catch (error) {
    console.error('Error checking certificate:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/certificates', (req, res) => {
  try {
    writeCertificates({ certificates: [] });
    res.json({ success: true, message: 'Certificate history cleared' });
  } catch (error) {
    console.error('Error clearing certificates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function openBrowser(url) {
  if (process.env.AUTO_OPEN_BROWSER === 'false') {
    return;
  }

  let command = '';

  if (process.platform === 'win32') {
    command = `start "" "${url}"`;
  } else if (process.platform === 'darwin') {
    command = `open "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.warn(`Unable to auto-open browser: ${error.message}`);
    }
  });
}

ensureConfigFile();
ensureCertificatesFile();

app.listen(PORT, () => {
  const appUrl = `http://localhost:${PORT}`;
  console.log(`Certificate Check Only app listening on ${appUrl}`);
  openBrowser(appUrl);
});

// Made with Bob
