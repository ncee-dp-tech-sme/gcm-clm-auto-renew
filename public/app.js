// Certificate Monitor Frontend Application

let certificates = [];
let targetUrl = '';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    loadCertificates();
    
    // Set up event listeners
    document.getElementById('checkNowBtn').addEventListener('click', checkCertificateNow);
});

// Load configuration
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        targetUrl = data.targetUrl;
        document.getElementById('targetUrl').textContent = targetUrl;
    } catch (error) {
        console.error('Error loading config:', error);
        showStatus('Error loading configuration', 'error');
    }
}

// Load certificates from the server
async function loadCertificates() {
    showLoading(true);
    hideStatus();
    
    try {
        const response = await fetch('/api/certificates');
        const data = await response.json();
        
        if (data.success) {
            certificates = data.certificates;
            targetUrl = data.targetUrl;
            document.getElementById('targetUrl').textContent = targetUrl;
            displayCertificates();
            updateLastUpdated();
        } else {
            showStatus('Error loading certificates: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error loading certificates:', error);
        showStatus('Error connecting to server', 'error');
    } finally {
        showLoading(false);
    }
}

// Check certificate now
async function checkCertificateNow() {
    showLoading(true);
    hideStatus();
    
    const button = document.getElementById('checkNowBtn');
    button.disabled = true;
    
    try {
        const response = await fetch('/api/check-certificate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            certificates = data.certificates;
            displayCertificates();
            updateLastUpdated();
            
            if (data.changed) {
                showStatus('✅ New certificate detected and saved!', 'success');
            } else {
                showStatus('ℹ️ Certificate unchanged - no updates needed', 'info');
            }
        } else {
            showStatus('Error checking certificate: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error checking certificate:', error);
        showStatus('Error connecting to server', 'error');
    } finally {
        showLoading(false);
        button.disabled = false;
    }
}

// Display certificates
function displayCertificates() {
    const container = document.getElementById('certificatesContainer');
    const noCerts = document.getElementById('noCertificates');
    
    if (!certificates || certificates.length === 0) {
        noCerts.style.display = 'block';
        return;
    }
    
    noCerts.style.display = 'none';
    
    // Create grid container
    let html = '<div class="certificates-grid">';
    
    certificates.forEach((cert, index) => {
        const isCurrent = index === 0;
        const cardClass = isCurrent ? 'current' : 'previous';
        const badgeClass = isCurrent ? 'badge-current' : 'badge-previous';
        const badgeText = isCurrent ? 'Current' : 'Previous';
        
        html += `
            <div class="certificate-card ${cardClass}">
                <div class="certificate-header">
                    <div class="certificate-title">🔒 Certificate Details</div>
                    <span class="certificate-badge ${badgeClass}">${badgeText}</span>
                </div>
                
                <div class="certificate-details">
                    ${renderDetailGroup('Subject Information', [
                        { label: 'Common Name', value: cert.subject.commonName },
                        { label: 'Organization', value: cert.subject.organization },
                        { label: 'Organizational Unit', value: cert.subject.organizationalUnit },
                        { label: 'Locality', value: cert.subject.locality },
                        { label: 'State', value: cert.subject.state },
                        { label: 'Country', value: cert.subject.country }
                    ])}
                    
                    ${renderDetailGroup('Issuer Information', [
                        { label: 'Common Name', value: cert.issuer.commonName },
                        { label: 'Organization', value: cert.issuer.organization },
                        { label: 'Country', value: cert.issuer.country }
                    ])}
                    
                    ${renderDetailGroup('Validity Period', [
                        { label: 'Valid From', value: formatDate(cert.validFrom) },
                        { label: 'Valid To', value: formatDate(cert.validTo) },
                        { label: 'Status', value: getValidityStatus(cert.validFrom, cert.validTo) }
                    ])}
                    
                    ${renderDetailGroup('Certificate Details', [
                        { label: 'Serial Number', value: cert.serialNumber },
                        { label: 'Fingerprint (SHA-1)', value: formatFingerprint(cert.fingerprint) },
                        { label: 'Fingerprint (SHA-256)', value: formatFingerprint(cert.fingerprint256) },
                        { label: 'Key Size', value: cert.bits ? `${cert.bits} bits` : 'N/A' }
                    ])}
                    
                    ${renderDetailGroup('Alternative Names', [
                        { label: 'SANs', value: cert.subjectAltNames }
                    ])}
                </div>
                
                <div class="fetched-time">
                    Fetched: ${formatDateTime(cert.fetchedAt)}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

// Render a detail group
function renderDetailGroup(title, details) {
    let html = `
        <div class="detail-group">
            <h3>${title}</h3>
    `;
    
    details.forEach(detail => {
        if (detail.value && detail.value !== 'N/A') {
            html += `
                <div class="detail-row">
                    <span class="detail-label">${detail.label}:</span>
                    <span class="detail-value">${detail.value}</span>
                </div>
            `;
        }
    });
    
    html += '</div>';
    return html;
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Format date and time
function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

// Format fingerprint
function formatFingerprint(fingerprint) {
    if (!fingerprint) return 'N/A';
    // Add spaces every 2 characters for readability
    return fingerprint.match(/.{1,2}/g).join(':');
}

// Get validity status
function getValidityStatus(validFrom, validTo) {
    const now = new Date();
    const from = new Date(validFrom);
    const to = new Date(validTo);
    
    if (now < from) {
        return '<span class="validity-status validity-expired">Not Yet Valid</span>';
    } else if (now > to) {
        return '<span class="validity-status validity-expired">Expired</span>';
    } else {
        const daysUntilExpiry = Math.floor((to - now) / (1000 * 60 * 60 * 24));
        if (daysUntilExpiry <= 30) {
            return `<span class="validity-status validity-expiring">Valid (Expires in ${daysUntilExpiry} days)</span>`;
        }
        return `<span class="validity-status validity-valid">Valid (${daysUntilExpiry} days remaining)</span>`;
    }
}

// Show loading indicator
function showLoading(show) {
    const loading = document.getElementById('loadingIndicator');
    if (show) {
        loading.classList.add('active');
    } else {
        loading.classList.remove('active');
    }
}

// Show status message
function showStatus(message, type) {
    const statusEl = document.getElementById('statusMessage');
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideStatus();
    }, 5000);
}

// Hide status message
function hideStatus() {
    const statusEl = document.getElementById('statusMessage');
    statusEl.className = 'status-message';
}

// Update last updated time
function updateLastUpdated() {
    const lastUpdatedEl = document.getElementById('lastUpdated');
    if (certificates.length > 0) {
        lastUpdatedEl.textContent = formatDateTime(certificates[0].fetchedAt);
    } else {
        lastUpdatedEl.textContent = 'Never';
    }
}

// Made with Bob
