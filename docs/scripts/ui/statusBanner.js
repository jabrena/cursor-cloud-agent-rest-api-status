import { getCurrentStatus } from '../data/processors.js';

/**
 * Update the status banner with current system status
 * @param {Array} measures - Array of measure objects
 */
export function updateStatusBanner(measures) {
    const currentStatus = getCurrentStatus(measures);
    const banner = document.getElementById('status-banner');
    const statusText = document.getElementById('status-text');
    const uptimeInfo = document.getElementById('uptime-info');
    
    if (!banner || !statusText || !uptimeInfo) {
        console.warn('Status banner elements not found');
        return;
    }
    
    // Update banner class (color)
    banner.className = `status-banner ${currentStatus.status}`;
    
    // Update status text
    statusText.textContent = currentStatus.text === 'No data available' 
        ? 'No data available' 
        : `All Systems ${currentStatus.text === 'Operational' ? 'Operational' : currentStatus.text}`;
    
    // Update uptime info
    if (measures.length > 0) {
        uptimeInfo.textContent = `Uptime over the last 24 hours: ${currentStatus.uptime.toFixed(2)}%`;
    } else {
        uptimeInfo.textContent = 'No measures available';
    }
}

/**
 * Show error state in status banner
 * @param {string} errorMessage - Error message to display
 */
export function showStatusBannerError(errorMessage) {
    const statusText = document.getElementById('status-text');
    if (statusText) {
        statusText.textContent = errorMessage || 'Error loading data';
    }
}

