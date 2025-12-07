import { parseDateTimeUTC, formatDateTime } from './utils/dateUtils.js';
import { TEST_TYPE_LABELS } from './utils/constants.js';

// Load and display measures for the specified hour
async function loadHourMeasures() {
    try {
        // Get hour from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const hour = parseInt(urlParams.get('hour'));
        
        if (isNaN(hour) || hour < 0 || hour > 23) {
            document.getElementById('hour-header').textContent = 'Invalid hour parameter';
            document.getElementById('measures-container').innerHTML = 
                '<div class="no-data">Please provide a valid hour (0-23) in the URL.</div>';
            return;
        }

        // Update header
        const hourFormatted = hour.toString().padStart(2, '0') + ':00';
        document.getElementById('hour-header').textContent = `Measures for ${hourFormatted}`;

        // Load measures
        const response = await fetch('data/measures.json');
        const allMeasures = await response.json();

        // Filter measures for the specified hour from the last 24 hours (UTC)
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        const hourMeasures = allMeasures.filter(measure => {
            const measureDate = parseDateTimeUTC(measure.localdatetime);
            // Check if measure is within last 24 hours and matches the UTC hour
            return measureDate >= last24Hours && measureDate.getUTCHours() === hour;
        });

        // Sort by datetime (oldest first)
        hourMeasures.sort((a, b) => {
            const dateA = parseDateTimeUTC(a.localdatetime);
            const dateB = parseDateTimeUTC(b.localdatetime);
            return dateA - dateB;
        });

        // Display measures
        const container = document.getElementById('measures-container');
        
        if (hourMeasures.length === 0) {
            container.innerHTML = `<div class="no-data">No measures found for ${hourFormatted}</div>`;
            return;
        }

        // Update header with count
        document.getElementById('hour-header').textContent = 
            `Measures for ${hourFormatted} UTC (${hourMeasures.length} measure${hourMeasures.length !== 1 ? 's' : ''})`;

        // Create table
        let tableHTML = `
            <table class="measures-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Status</th>
                        <th>Test type</th>
                        <th>Pipeline latency</th>
                        <th>Cursor latency</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        hourMeasures.forEach(measure => {
            const testType = measure['test-type'] || '-';
            const displayTestType = TEST_TYPE_LABELS[testType] || testType;
            const cursorLatency = measure['cursor-latency'] && measure['cursor-latency'] !== '' 
                ? parseFloat(measure['cursor-latency']) || 0 
                : null;
            const cursorLatencyDisplay = cursorLatency !== null ? `${cursorLatency} sec` : '-';
            tableHTML += `
                <tr>
                    <td>${formatDateTime(measure.localdatetime)}</td>
                    <td>
                        <span class="status-badge ${measure.status.toLowerCase()}">
                            ${measure.status}
                        </span>
                    </td>
                    <td>${displayTestType}</td>
                    <td class="latency-cell">
                        ${measure.latency} sec
                    </td>
                    <td class="latency-cell">
                        ${cursorLatencyDisplay}
                    </td>
                </tr>
            `;
        });

        tableHTML += `
                </tbody>
            </table>
        `;

        container.innerHTML = tableHTML;
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('hour-header').textContent = 'Error loading data';
        document.getElementById('measures-container').innerHTML = 
            '<div class="no-data">An error occurred while loading the measures.</div>';
    }
}

// Load data when page loads
loadHourMeasures();

