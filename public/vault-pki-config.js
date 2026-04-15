// Vault PKI Configuration Page JavaScript

let currentConfig = null;

// Load configuration on page load
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
    document.getElementById('obtainCertBtn').addEventListener('click', obtainCertificate);
});

// Load current configuration
async function loadConfig() {
    try {
        const response = await fetch('/api/acme/config');
        const data = await response.json();
        
        if (data.success) {
            currentConfig = data.config;
            
            // Populate form fields
            document.getElementById('commonName').value = currentConfig.commonName || 'localhost';
            document.getElementById('vaultAddr').value = currentConfig.vaultAddr || 'http://vault:8200';
            document.getElementById('roleName').value = currentConfig.roleName || 'localhost';
            
            // Update status
            updateStatus(data.status);
        }
    } catch (error) {
        console.error('Error loading config:', error);
        showStatus('Error loading configuration', 'error');
    }
}

// Update status display
function updateStatus(status) {
    const statusDiv = document.getElementById('statusInfo');
    
    let html = '<div class="status-grid">';
    
    // Configuration status
    html += `<div class="status-item">
        <span class="status-label">Configuration:</span>
        <span class="status-value ${status.configured ? 'status-success' : 'status-warning'}">
            ${status.configured ? '✅ Configured' : '⚠️ Not Configured'}
        </span>
    </div>`;
    
    // Certificate status
    html += `<div class="status-item">
        <span class="status-label">Certificate:</span>
        <span class="status-value ${status.certificateExists ? 'status-success' : 'status-warning'}">
            ${status.certificateExists ? '✅ Exists' : '❌ Not Found'}
        </span>
    </div>`;
    
    // Certificate info
    if (status.certificateInfo) {
        html += `<div class="status-item">
            <span class="status-label">Days Remaining:</span>
            <span class="status-value ${status.certificateInfo.daysRemaining > 7 ? 'status-success' : 'status-warning'}">
                ${status.certificateInfo.daysRemaining} days
            </span>
        </div>`;
        
        html += `<div class="status-item">
            <span class="status-label">Expires:</span>
            <span class="status-value">
                ${new Date(status.certificateInfo.notAfter).toLocaleString()}
            </span>
        </div>`;
    }
    
    // Renewal status
    html += `<div class="status-item">
        <span class="status-label">Needs Renewal:</span>
        <span class="status-value ${status.needsRenewal ? 'status-warning' : 'status-success'}">
            ${status.needsRenewal ? '⚠️ Yes' : '✅ No'}
        </span>
    </div>`;
    
    html += '</div>';
    statusDiv.innerHTML = html;
}

// Save configuration
async function saveConfig() {
    const commonName = document.getElementById('commonName').value.trim();
    
    if (!commonName) {
        showStatus('Please enter a common name', 'error');
        return;
    }
    
    const config = {
        commonName: commonName
    };
    
    try {
        showStatus('Saving configuration...', 'info');
        
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
            currentConfig = data.config;
            updateStatus(data.status);
        } else {
            showStatus(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showStatus('❌ Error saving configuration', 'error');
    }
}

// Obtain certificate
async function obtainCertificate() {
    if (!currentConfig || !currentConfig.commonName) {
        showStatus('Please save configuration first', 'error');
        return;
    }
    
    try {
        showStatus('🔄 Requesting certificate from Vault PKI...', 'info');
        
        const response = await fetch('/api/acme/obtain-certificate', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('✅ Certificate obtained successfully! Server will restart to use the new certificate.', 'success');
            
            // Reload status after a delay
            setTimeout(() => {
                loadConfig();
            }, 2000);
        } else {
            showStatus(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error obtaining certificate:', error);
        showStatus('❌ Error obtaining certificate', 'error');
    }
}

// Show status message
function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = message;
    statusDiv.className = `status-message status-${type}`;
    statusDiv.style.display = 'block';
    
    // Auto-hide after 5 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}

// Made with Bob
