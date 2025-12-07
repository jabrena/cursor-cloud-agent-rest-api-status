export function getStatusColor(status, latency) {
    if (!status) return 'grey';
    if (status === 'DOWN') return 'red';
    return 'green';
}

export function getStatusText(status, latency) {
    if (!status) return 'No data';
    if (status === 'DOWN') return 'Major Outage';
    return 'Operational';
}

