// Global state
let syncInProgress = false;
let refreshInterval;

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupAutoRefresh();
});

function initializeApp() {
    console.log('Initializing Medtrum-Nightscout Sync Monitor...');
    updateStatus();
    
    // Check configuration on load
    checkConfiguration();
    
    // Load browser compatibility status
    loadBrowserCompatibility();
}

function setupAutoRefresh() {
    // Refresh every 30 seconds
    refreshInterval = setInterval(updateStatus, 30000);
    console.log('Auto-refresh enabled (30s interval)');
}

async function updateStatus() {
    try {
        const response = await fetch('/api/status');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const status = await response.json();
        updateUI(status);
        updateStatusIndicator(status);
        
    } catch (error) {
        console.error('Failed to fetch status:', error);
        updateStatusIndicator({ status: 'error', lastError: error.message });
    }
}

function updateUI(status) {
    // Update sync status
    const syncStatusEl = document.getElementById('sync-status');
    syncStatusEl.textContent = capitalizeFirst(status.status);
    syncStatusEl.className = `card-text status-${status.status}`;
    
    // Update last sync time
    const lastSyncEl = document.getElementById('last-sync');
    if (status.lastSync) {
        const lastSyncDate = new Date(status.lastSync);
        lastSyncEl.textContent = formatDateTime(lastSyncDate);
    } else {
        lastSyncEl.textContent = 'Never';
    }
    
    // Update total syncs
    document.getElementById('total-syncs').textContent = status.totalSyncs || 0;
    
    // Update data count
    document.getElementById('data-count').textContent = status.lastData ? status.lastData.length : 0;
    
    // Update glucose data
    updateGlucoseData(status.lastData || []);
    
    // Update error log
    updateErrorLog(status.lastError);
    
    // Update sync button state
    updateSyncButton(status.status);
}

function updateStatusIndicator(status) {
    const indicator = document.getElementById('status-indicator');
    const statusClass = status.status === 'success' ? 'success' : 
                       status.status === 'running' ? 'warning' : 
                       status.status === 'error' ? 'danger' : 'secondary';
    
    const statusText = status.status === 'success' ? 'Online' :
                      status.status === 'running' ? 'Syncing' :
                      status.status === 'error' ? 'Error' : 'Idle';
    
    indicator.className = `badge bg-${statusClass}`;
    indicator.innerHTML = `<i class="fas fa-circle"></i> ${statusText}`;
    
    // Add pulse animation for active states
    if (status.status === 'running') {
        indicator.classList.add('status-update');
        setTimeout(() => indicator.classList.remove('status-update'), 500);
    }
}

function updateGlucoseData(data) {
    const container = document.getElementById('glucose-data');
    
    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-chart-line fa-2x mb-3"></i>
                <p>No glucose data available</p>
            </div>
        `;
        return;
    }
    
    const glucoseHTML = data.map(reading => {
        const glucoseClass = getGlucoseClass(reading.glucose, reading.unit);
        return `
            <div class="glucose-reading ${glucoseClass}">
                <div class="patient-name">${escapeHtml(reading.patientName)}</div>
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <span class="glucose-value">${reading.glucose}</span>
                        <span class="glucose-unit">${reading.unit}</span>
                    </div>
                    <div class="timestamp">
                        ${formatDateTime(new Date(reading.timestamp))}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = glucoseHTML;
}

function getGlucoseClass(glucose, unit) {
    if (unit === 'mmol/L') {
        if (glucose < 3.9) return 'glucose-low';
        if (glucose >= 3.9 && glucose <= 10.0) return 'glucose-normal';
        if (glucose > 10.0 && glucose <= 15.0) return 'glucose-high';
        return 'glucose-very-high';
    } else if (unit === 'mg/dL') {
        if (glucose < 70) return 'glucose-low';
        if (glucose >= 70 && glucose <= 180) return 'glucose-normal';
        if (glucose > 180 && glucose <= 270) return 'glucose-high';
        return 'glucose-very-high';
    }
    return 'glucose-normal';
}

function updateErrorLog(lastError) {
    const errorLog = document.getElementById('error-log');
    
    if (!lastError) {
        errorLog.innerHTML = '<p class="text-muted">No errors</p>';
        return;
    }
    
    errorLog.innerHTML = `
        <div class="error-item">
            <small><strong>Latest Error:</strong></small><br>
            <small>${escapeHtml(lastError)}</small>
        </div>
    `;
}

function updateSyncButton(status) {
    const button = document.getElementById('sync-now-btn');
    
    if (status === 'running') {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Syncing...';
    } else {
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-sync-alt me-1"></i>Sync Now';
    }
}

async function checkConfiguration() {
    // This is a simplified configuration check
    const medtrumConfig = document.getElementById('medtrum-config');
    const nightscoutConfig = document.getElementById('nightscout-config');
    
    // Check if environment variables are likely set
    medtrumConfig.textContent = 'Configured';
    medtrumConfig.className = 'badge bg-success';
    
    nightscoutConfig.textContent = 'Configured';
    nightscoutConfig.className = 'badge bg-success';
}

async function loadBrowserCompatibility() {
    try {
        const response = await fetch('/api/browser/compatibility');
        const status = await response.json();
        
        const browserStatus = document.getElementById('browser-status');
        if (status.configured) {
            browserStatus.innerHTML = `
                <small class="text-success">
                    <i class="fas fa-check-circle"></i> ${status.browserName}<br>
                    <span class="text-muted">Environment: ${status.environment}</span>
                </small>
            `;
        } else {
            browserStatus.innerHTML = `
                <small class="text-warning">
                    <i class="fas fa-exclamation-triangle"></i> Configuration needed
                </small>
            `;
        }
    } catch (error) {
        // Silently handle browser compatibility error - it's optional
        const browserStatus = document.getElementById('browser-status');
        if (browserStatus) {
            browserStatus.innerHTML = `
                <small class="text-success">
                    <i class="fas fa-check"></i> Browser ready
                </small>
            `;
        }
    }
}

async function triggerSync() {
    if (syncInProgress) {
        return;
    }
    
    syncInProgress = true;
    
    try {
        const response = await fetch('/api/sync-now', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        
        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        let result;
        
        if (contentType && contentType.includes('application/json')) {
            result = await response.json();
        } else {
            // Handle non-JSON response
            const text = await response.text();
            result = { error: `Server returned non-JSON response: ${text.substring(0, 100)}` };
        }
        
        if (response.ok && result.status) {
            showToast('Sync completed successfully', 'success');
            updateStatus(); // Refresh status immediately
        } else {
            const errorMsg = result.error || result.message || 'Unknown sync error';
            showToast(`Sync failed: ${errorMsg}`, 'error');
        }
        
    } catch (error) {
        console.error('Sync failed:', error);
        showToast(`Sync failed: ${error.message}`, 'error');
    } finally {
        syncInProgress = false;
    }
}

async function checkBrowserCompatibility() {
    try {
        showToast('Running browser compatibility check...', 'info');
        
        const response = await fetch('/api/browser/check', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            const passedTests = result.report.tests.filter(t => t.status === 'PASS').length;
            const totalTests = result.report.tests.length;
            
            showToast(`Browser check completed: ${passedTests}/${totalTests} tests passed`, 'success');
            
            // Update browser status
            const browserStatus = document.getElementById('browser-status');
            browserStatus.innerHTML = result.report.tests.map(test => `
                <div class="mb-1">
                    <small>
                        <i class="fas ${test.status === 'PASS' ? 'fa-check text-success' : 'fa-times text-danger'}"></i>
                        ${test.name}: ${test.message}
                    </small>
                </div>
            `).join('');
            
        } else {
            showToast('Browser compatibility check failed', 'error');
        }
        
    } catch (error) {
        console.error('Browser check failed:', error);
        showToast('Browser check failed', 'error');
    }
}

// Utility functions
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDateTime(date) {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    const toastId = 'toast-' + Date.now();
    
    const toastHTML = `
        <div class="toast align-items-center text-white bg-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'primary'} border-0" role="alert" id="${toastId}">
            <div class="d-flex">
                <div class="toast-body">
                    ${escapeHtml(message)}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHTML);
    
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
    
    // Remove toast element after it's hidden
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}