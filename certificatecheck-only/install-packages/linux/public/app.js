let certificates = [];
let targetUrl = '';

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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('checkNowBtn').addEventListener('click', checkCertificateNow);
  document.getElementById('updateUrlBtn').addEventListener('click', updateTargetUrl);
  document.getElementById('clearStorageBtn').addEventListener('click', clearStorage);

  loadConfig();
  loadCertificates();
});

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const data = await response.json();
    targetUrl = data.targetUrl || '';
    document.getElementById('urlInput').value = targetUrl;
  } catch (error) {
    console.error('Error loading config:', error);
    showStatus('Error loading configuration', 'error');
  }
}

async function updateTargetUrl() {
  const newUrl = document.getElementById('urlInput').value.trim();

  if (!newUrl) {
    showStatus('Please enter a valid URL', 'error');
    return;
  }

  try {
    new URL(newUrl);
  } catch (error) {
    showStatus('Invalid URL format. Please use format: https://www.example.com', 'error');
    return;
  }

  if (!newUrl.startsWith('https://')) {
    showStatus('URL must start with https://', 'error');
    return;
  }

  try {
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ targetUrl: newUrl })
    });

    const data = await response.json();

    if (data.success) {
      targetUrl = newUrl;
      certificates = [];
      displayCertificates();
      renderCertificateComparison([]);
      updateLastUpdated();
      showStatus('✅ Target URL updated successfully. Click "Check Certificate" to fetch the certificate.', 'success');
    } else {
      showStatus('Error updating URL: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error updating URL:', error);
    showStatus('Error connecting to server', 'error');
  }
}

async function clearStorage() {
  if (!confirm('Are you sure you want to clear all certificate history?')) {
    return;
  }

  try {
    const response = await fetch('/api/certificates', {
      method: 'DELETE'
    });

    const data = await response.json();

    if (data.success) {
      certificates = [];
      displayCertificates();
      renderCertificateComparison([]);
      updateLastUpdated();
      showStatus('✅ Certificate history cleared successfully!', 'success');
    } else {
      showStatus('Error clearing history: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error clearing history:', error);
    showStatus('Error connecting to server', 'error');
  }
}

async function loadCertificates() {
  showLoading(true);
  hideStatus();

  try {
    const response = await fetch('/api/certificates');
    const data = await response.json();

    if (data.success) {
      certificates = data.certificates || [];
      targetUrl = data.targetUrl || '';
      document.getElementById('urlInput').value = targetUrl;
      displayCertificates();
      renderCertificateComparison(certificates);
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

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.success) {
      certificates = data.certificates || [];
      displayCertificates();
      renderCertificateComparison(certificates);
      updateLastUpdated();

      if (data.changed) {
        showStatus('✅ New certificate detected and saved!', 'success');
      } else {
        showStatus('ℹ️ Certificate unchanged', 'info');
      }
    } else {
      showStatus('Error checking certificate: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error checking certificate:', error);
    showStatus('Error: ' + (error.message || 'Unable to connect to server'), 'error');
  } finally {
    showLoading(false);
    button.disabled = false;
  }
}

function displayCertificates() {
  const container = document.getElementById('certificatesContainer');
  const noCerts = document.getElementById('noCertificates');

  if (!certificates || certificates.length === 0) {
    container.innerHTML = '';
    if (noCerts) {
      noCerts.style.display = 'block';
      container.appendChild(noCerts);
    }
    return;
  }

  if (noCerts) {
    noCerts.style.display = 'none';
  }

  const current = certificates[0];
  const previous = certificates[1];

  let html = '<div class="certificates-grid">';

  if (current) {
    html += createCertificateCard(current, 'current', 'Current');
  }

  if (previous) {
    html += createCertificateCard(previous, 'previous', 'Previous');
  }

  html += '</div>';
  container.innerHTML = html;
}

function createCertificateCard(cert, cardClass, badgeText) {
  const badgeClass = cardClass === 'current' ? 'badge-current' : 'badge-previous';

  return `
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
}

function renderDetailGroup(title, details) {
  let html = `
    <div class="detail-group">
      <h3>${title}</h3>
  `;

  details.forEach((detail) => {
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

function getNestedValue(source, path) {
  return path.split('.').reduce((value, key) => (value && value[key] !== undefined ? value[key] : ''), source);
}

function escapeHtml(value) {
  return String(value ?? '')
    .split('&').join('&')
    .split('<').join('<')
    .split('>').join('>')
    .split('"').join('"');
}

function valuesDiffer(currentValue, previousValue) {
  return String(currentValue ?? '') !== String(previousValue ?? '');
}

function renderCertificateComparison(certificateList) {
  const comparisonSection = document.getElementById('comparisonSection');
  const currentContainer = document.getElementById('currentCertificateDetails');
  const previousContainer = document.getElementById('previousCertificateDetails');
  const summaryContainer = document.getElementById('comparisonSummary');

  const currentCertificate = Array.isArray(certificateList) ? certificateList[0] : null;
  const previousCertificate = Array.isArray(certificateList) ? certificateList[1] : null;

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

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

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

function formatFingerprint(fingerprint) {
  if (!fingerprint) {
    return 'N/A';
  }

  return fingerprint.match(/.{1,2}/g).join(':');
}

function getValidityStatus(validFrom, validTo) {
  const now = new Date();
  const from = new Date(validFrom);
  const to = new Date(validTo);

  if (now < from) {
    return '<span class="validity-status validity-expired">Not Yet Valid</span>';
  }

  if (now > to) {
    return '<span class="validity-status validity-expired">Expired</span>';
  }

  const daysUntilExpiry = Math.floor((to - now) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry <= 30) {
    return `<span class="validity-status validity-expiring">Valid (Expires in ${daysUntilExpiry} days)</span>`;
  }

  return `<span class="validity-status validity-valid">Valid (${daysUntilExpiry} days remaining)</span>`;
}

function showLoading(show) {
  const loading = document.getElementById('loadingIndicator');
  if (show) {
    loading.classList.add('active');
  } else {
    loading.classList.remove('active');
  }
}

function showStatus(message, type) {
  const statusEl = document.getElementById('statusMessage');
  statusEl.textContent = message;
  statusEl.className = `status-message status-${type}`;

  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      hideStatus();
    }, 5000);
  }
}

function hideStatus() {
  const statusEl = document.getElementById('statusMessage');
  statusEl.className = 'status-message';
}

function updateLastUpdated() {
  const lastUpdatedEl = document.getElementById('lastUpdated');
  if (certificates.length > 0) {
    lastUpdatedEl.textContent = formatDateTime(certificates[0].fetchedAt);
  } else {
    lastUpdatedEl.textContent = 'Never';
  }
}

// Made with Bob
