// ACME Configuration Frontend

let acmeConfig = {};
const CERTIFICATE_COMPARISON_FIELDS = [
    ['subject.commonName', 'Subject Common Name'],
    ['subject.organization', 'Subject Organization'],
    ['issuer.commonName', 'Issuer Common Name'],
    ['issuer.organization', 'Issuer Organization'],
    ['validFrom', 'Valid From'],
    ['validTo', 'Valid To'],
    ['serialNumber', 'Serial Number'],
    ['fingerprint256', 'SHA-256 Fingerprint'],
    ['fingerprint', 'SHA-1 Fingerprint'],
    ['subjectAltNames', 'Subject Alt Names'],
    ['url', 'URL'],
    ['fetchedAt', 'Fetched At']
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadAcmeConfig();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfiguration);
    document.getElementById('testConfigBtn').addEventListener('click', testConfiguration);
    document.getElementById('obtainCertBtn').addEventListener('click', obtainCertificate);
    
    document.getElementById('acmeDirectoryUrl').addEventListener('change', (e) => {
        const customUrlGroup = document.getElementById('customUrlGroup');
        if (customUrlGroup) {
            if (e.target.value === 'custom') {
                customUrlGroup.style.display = 'block';
            } else {
                customUrlGroup.style.display = 'none';
            }
        }
    });
}

// Load ACME configuration
async function loadAcmeConfig() {
    try {
        const response = await fetch('/api/acme/config');
        const data = await response.json();
        
        if (data.success) {
            acmeConfig = data.config;
            populateForm(acmeConfig);
            updateStatus(data.status);
            renderCertificateComparison([]);
        } else {
            showStatus('Error loading configuration: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error loading ACME config:', error);
        showStatus('Error connecting to server', 'error');
    }
}

// Populate form with config data
function populateForm(config) {
    document.getElementById('email').value = config.email || '';
    document.getElementById('domain').value = config.domain || '';
    document.getElementById('challengeType').value = config.challengeType || 'http-01';
    document.getElementById('checkInterval').value = config.checkIntervalMinutes || 3;
    
    const acmeUrlSelect = document.getElementById('acmeDirectoryUrl');
    const customUrl = document.getElementById('customAcmeUrl');
    
    if (config.acmeDirectoryUrl === 'https://acme-staging-v02.api.letsencrypt.org/directory' ||
        config.acmeDirectoryUrl === 'https://acme-v02.api.letsencrypt.org/directory') {
        acmeUrlSelect.value = config.acmeDirectoryUrl;
    } else {
        acmeUrlSelect.value = 'custom';
        customUrl.value = config.acmeDirectoryUrl;
        const customUrlGroup = document.getElementById('customUrlGroup');
        if (customUrlGroup) {
            customUrlGroup.style.display = 'block';
        }
    }
}

// Update status display
function updateStatus(status) {
    if (!status) return;
    
    document.getElementById('accountStatus').textContent = status.accountConfigured ? 'Configured ✓' : 'Not configured';
    document.getElementById('certificateStatus').textContent = status.certificateObtained ? 'Obtained ✓' : 'Not obtained';
    document.getElementById('lastCheck').textContent = status.lastCheck || 'Never';
    document.getElementById('nextCheck').textContent = status.nextCheck || '-';
    
    // Update status colors
    const accountStatus = document.getElementById('accountStatus');
    accountStatus.className = 'status-value ' + (status.accountConfigured ? 'status-success' : 'status-warning');
    
    const certStatus = document.getElementById('certificateStatus');
    certStatus.className = 'status-value ' + (status.certificateObtained ? 'status-success' : 'status-warning');
}

// Save configuration
async function saveConfiguration() {
    const email = document.getElementById('email').value.trim();
    const domain = document.getElementById('domain').value.trim();
    const challengeType = document.getElementById('challengeType').value;
    const checkInterval = parseInt(document.getElementById('checkInterval').value);
    
    let acmeDirectoryUrl = document.getElementById('acmeDirectoryUrl').value;
    if (acmeDirectoryUrl === 'custom') {
        acmeDirectoryUrl = document.getElementById('customAcmeUrl').value.trim();
    }
    
    // Validation
    if (!email || !domain || !acmeDirectoryUrl) {
        showStatus('Please fill in all required fields', 'error');
        return;
    }
    
    if (!email.includes('@')) {
        showStatus('Please enter a valid email address', 'error');
        return;
    }
    
    if (!acmeDirectoryUrl.startsWith('https://') && !acmeDirectoryUrl.startsWith('http://')) {
        showStatus('ACME URL must start with http:// or https://', 'error');
        return;
    }
    
    const config = {
        email,
        domain,
        acmeDirectoryUrl,
        challengeType,
        checkIntervalMinutes: checkInterval
    };
    
    try {
        const response = await fetch('/api/acme/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('✅ Configuration saved successfully!', 'success');
            acmeConfig = config;
            updateStatus(data.status);
        } else {
            showStatus('Error saving configuration: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showStatus('Error connecting to server', 'error');
    }
}

// Test configuration
async function testConfiguration() {
    showStatus('Testing configuration...', 'info');
    
    try {
        const response = await fetch('/api/acme/test', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('✅ Configuration test successful! ' + data.message, 'success');
        } else {
            showStatus('❌ Configuration test failed: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error testing config:', error);
        showStatus('Error connecting to server', 'error');
    }
}

// Obtain certificate
async function obtainCertificate() {
    if (!confirm('This will attempt to obtain a certificate from the ACME server. Continue?')) {
        return;
    }
    
    showStatus('Obtaining certificate... This may take a few minutes.', 'info');
    
    try {
        const response = await fetch('/api/acme/obtain-certificate', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('✅ Certificate obtained successfully! Server will restart with HTTPS.', 'success');
            updateStatus(data.status);
            renderCertificateComparison(data.certificates || []);
            
            // Redirect to HTTPS after a delay
            setTimeout(() => {
                window.location.href = 'https://' + window.location.hostname + '/acme-config.html';
            }, 3000);
        } else {
            showStatus('❌ Failed to obtain certificate: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error obtaining certificate:', error);
        showStatus('Error connecting to server', 'error');
    }
}

function getNestedValue(source, path) {
    return path.split('.').reduce((value, key) => (value && value[key] !== undefined ? value[key] : ''), source);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&')
        .replaceAll('<', '<')
        .replaceAll('>', '>')
        .replaceAll('"', '"')
        .replaceAll('`', '&#96;');
}

function valuesDiffer(currentValue, previousValue) {
    return String(currentValue ?? '') !== String(previousValue ?? '');
}

function renderCertificateComparison(certificates) {
    const comparisonSection = document.getElementById('certificateComparison');
    const currentContainer = document.getElementById('currentCertificateDetails');
    const previousContainer = document.getElementById('previousCertificateDetails');
    const summaryContainer = document.getElementById('comparisonSummary');

    if (!comparisonSection || !currentContainer || !previousContainer || !summaryContainer) {
        return;
    }

    const currentCertificate = Array.isArray(certificates) ? certificates[0] : null;
    const previousCertificate = Array.isArray(certificates) ? certificates[1] : null;

    if (!currentCertificate || !previousCertificate) {
        comparisonSection.style.display = 'none';
        currentContainer.innerHTML = '';
        previousContainer.innerHTML = '';
        summaryContainer.innerHTML = '';
        return;
    }

    const changedFields = CERTIFICATE_COMPARISON_FIELDS.filter(([fieldPath]) => {
        return valuesDiffer(getNestedValue(currentCertificate, fieldPath), getNestedValue(previousCertificate, fieldPath));
    });

    if (!changedFields.length) {
        comparisonSection.style.display = 'none';
        currentContainer.innerHTML = '';
        previousContainer.innerHTML = '';
        summaryContainer.innerHTML = '';
        return;
    }

    comparisonSection.style.display = 'block';
    summaryContainer.innerHTML = `<strong>${changedFields.length}</strong> field(s) changed between the current and previous certificate.`;

    const renderColumn = (certificate, counterpart) => {
        return CERTIFICATE_COMPARISON_FIELDS.map(([fieldPath, label]) => {
            const value = getNestedValue(certificate, fieldPath) || 'N/A';
            const otherValue = getNestedValue(counterpart, fieldPath) || 'N/A';
            const changed = valuesDiffer(value, otherValue);

            return `
                <div class="comparison-row${changed ? ' comparison-row-changed' : ''}">
                    <div class="comparison-label">
                        ${changed ? '<span class="diff-marker" aria-hidden="true">*</span>' : '<span class="diff-marker-placeholder"></span>'}
                        <span>${escapeHtml(label)}</span>
                    </div>
                    <div class="comparison-value">${escapeHtml(value)}</div>
                </div>
            `;
        }).join('');
    };

    currentContainer.innerHTML = renderColumn(currentCertificate, previousCertificate);
    previousContainer.innerHTML = renderColumn(previousCertificate, currentCertificate);
}

// Show status message
function showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    
    // Auto-hide after 10 seconds for success/info messages
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            hideStatus();
        }, 10000);
    }
}

// Hide status message
function hideStatus() {
    const statusEl = document.getElementById('statusMessage');
    statusEl.className = 'status-message';
}

// Made with Bob
