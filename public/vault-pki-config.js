// Vault PKI Configuration Page JavaScript

let currentConfig = null;

// Load configuration on page load
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);
    document.getElementById('restoreDefaultBtn').addEventListener('click', restoreDefaultConfig);
    document.getElementById('obtainCertBtn').addEventListener('click', obtainCertificate);
    document.getElementById('toggleTokenBtn').addEventListener('click', () => toggleTokenVisibility('vaultToken', 'toggleTokenBtn'));
    document.getElementById('toggleUnsealTokenBtn').addEventListener('click', () => toggleTokenVisibility('vaultUnsealToken', 'toggleUnsealTokenBtn'));
});

// Load current configuration
async function loadConfig() {
    try {
        const response = await fetch('/api/acme/config');
        const data = await response.json();
        
        if (data.success) {
            currentConfig = data.config;
            
            // Populate Vault connection fields
            document.getElementById('displayVaultAddr').value = currentConfig.vaultAddr || 'http://vault:8200';
            document.getElementById('vaultToken').value = currentConfig.vaultToken || '';
            document.getElementById('vaultUnsealToken').value = currentConfig.vaultUnsealToken || '';
            
            // Populate form fields
            document.getElementById('commonName').value = currentConfig.commonName || 'localhost';
            document.getElementById('vaultAddr').value = currentConfig.vaultAddr || 'http://vault:8200';
            document.getElementById('pkiPath').value = currentConfig.pkiPath || 'pki';
            document.getElementById('roleName').value = currentConfig.roleName || 'localhost';
            
            // Update status
            updateStatus(data.status);
            updateRestoreDefaultButton(data.status);
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

function updateRestoreDefaultButton(status) {
    const button = document.getElementById('restoreDefaultBtn');
    if (!button) {
        return;
    }

    button.disabled = !status || (!status.hasDefaultBackup && status.isDefaultConfig);
}

// Save configuration
async function saveConfig() {
    const commonName = document.getElementById('commonName').value.trim();
    const vaultAddr = document.getElementById('vaultAddr').value.trim();
    const pkiPath = document.getElementById('pkiPath').value.trim() || 'pki';
    const roleName = document.getElementById('roleName').value.trim();
    
    if (!commonName) {
        showStatus('Please enter a common name', 'error');
        return;
    }

    if (!vaultAddr) {
        showStatus('Please enter a Vault address', 'error');
        return;
    }

    if (!roleName) {
        showStatus('Please enter a Vault PKI role', 'error');
        return;
    }

    try {
        const parsedVaultUrl = new URL(vaultAddr);
        if (parsedVaultUrl.protocol !== 'http:' && parsedVaultUrl.protocol !== 'https:') {
            showStatus('Vault address must start with http:// or https://', 'error');
            return;
        }
    } catch (error) {
        showStatus('Invalid Vault address format', 'error');
        return;
    }
    
    const vaultToken = document.getElementById('vaultToken').value.trim();

    const config = {
        commonName: commonName,
        vaultAddr: vaultAddr,
        pkiPath: pkiPath.replace(/^\/+|\/+$/g, ''),
        roleName: roleName
    };

    if (vaultToken) {
        config.vaultToken = vaultToken;
    }
    
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
            document.getElementById('displayVaultAddr').value = currentConfig.vaultAddr || vaultAddr;
            document.getElementById('vaultToken').value = currentConfig.vaultToken || '';
            document.getElementById('vaultUnsealToken').value = currentConfig.vaultUnsealToken || '';
            updateStatus(data.status);
            updateRestoreDefaultButton(data.status);
        } else {
            showStatus(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error saving config:', error);
        showStatus('❌ Error saving configuration', 'error');
    }
}

async function restoreDefaultConfig() {
    if (!confirm('Restore the Vault configuration to the saved default values?')) {
        return;
    }

    try {
        showStatus('Restoring default configuration...', 'info');

        const response = await fetch('/api/acme/config/restore-default', {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            showStatus('✅ Default configuration restored successfully!', 'success');
            currentConfig = data.config;
            document.getElementById('displayVaultAddr').value = currentConfig.vaultAddr || 'http://vault:8200';
            document.getElementById('vaultToken').value = currentConfig.vaultToken || '';
            document.getElementById('vaultUnsealToken').value = currentConfig.vaultUnsealToken || '';
            document.getElementById('commonName').value = currentConfig.commonName || 'localhost';
            document.getElementById('vaultAddr').value = currentConfig.vaultAddr || 'http://vault:8200';
            document.getElementById('pkiPath').value = currentConfig.pkiPath || 'pki';
            document.getElementById('roleName').value = currentConfig.roleName || 'localhost';
            updateStatus(data.status);
            updateRestoreDefaultButton(data.status);
        } else {
            showStatus(`❌ Error: ${data.error}`, 'error');
        }
    } catch (error) {
        console.error('Error restoring default config:', error);
        showStatus('❌ Error restoring default configuration', 'error');
    }
}

// Obtain certificate
async function obtainCertificate() {
    if (!currentConfig || !currentConfig.commonName) {
        showStatus('Please save configuration first', 'error');
        return;
    }
    
    try {
        showStatus('🔄 Requesting new certificate from Vault PKI...', 'info');
        
        const response = await fetch('/api/acme/obtain-certificate', {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showStatus('✅ Certificate obtained successfully! Nginx will be reloaded.', 'success');
            
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


// Toggle token visibility
function toggleTokenVisibility(inputId, buttonId) {
    const tokenInput = document.getElementById(inputId);
    const toggleBtn = document.getElementById(buttonId);
    
    if (!tokenInput || !toggleBtn) {
        return;
    }

    if (tokenInput.type === 'password') {
        tokenInput.type = 'text';
        toggleBtn.textContent = '🙈 Hide';
    } else {
        tokenInput.type = 'password';
        toggleBtn.textContent = '👁️ Show';
    }
}

// Show status message
function showStatus(message, type) {
    const statusDiv = document.getElementById('statusMessage');
    if (!statusDiv) {
        console.error('Status message element not found');
        return;
    }
    statusDiv.textContent = message;
    statusDiv.className = `status-message status-${type}`;
    
    // Auto-hide after 5 seconds for success/info messages
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            hideStatus();
        }, 5000);
    }
}

// Hide status message
function hideStatus() {
    const statusDiv = document.getElementById('statusMessage');
    if (!statusDiv) {
        return;
    }
    statusDiv.className = 'status-message';
}

// Made with Bob
