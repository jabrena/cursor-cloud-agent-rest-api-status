import { parseDateTime } from '../utils/dateUtils.js';
import { getStatusColor, getStatusText } from '../utils/statusUtils.js';

// Calculate overall uptime for last 24 hours
export function calculateOverallUptime(measures) {
    if (measures.length === 0) return 0;
    
    // Filter measures from last 24 hours
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentMeasures = measures.filter(m => {
        const measureDate = parseDateTime(m.localdatetime);
        return measureDate >= last24Hours;
    });
    
    if (recentMeasures.length === 0) return 0;
    
    let operational = 0;
    recentMeasures.forEach(m => {
        if (m.status === 'UP') {
            operational++;
        }
    });
    return (operational / recentMeasures.length) * 100;
}

// Get current status
export function getCurrentStatus(measures) {
    if (measures.length === 0) {
        return { status: 'grey', text: 'No data available', uptime: 0 };
    }
    const uptime = calculateOverallUptime(measures);
    
    // If uptime is 100%, show green/operational
    if (uptime === 100) {
        return { status: 'green', text: 'Operational', uptime, latest: measures[measures.length - 1] };
    }
    
    // If uptime < 100% but system is operational, show orange/yellow
    const latest = measures[measures.length - 1];
    if (latest.status === 'UP') {
        return { status: 'yellow', text: 'Operational', uptime, latest };
    }
    
    // Otherwise, check the latest measure's status (DOWN)
    const color = getStatusColor(latest.status, latest.latency);
    const text = getStatusText(latest.status, latest.latency);
    return { status: color, text, uptime, latest };
}

