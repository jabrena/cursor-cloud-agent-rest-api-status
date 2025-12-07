/**
 * Parse datetime from format "YYYYMMDD HH:MM" (local time)
 */
export function parseDateTime(dateTimeStr) {
    const [dateStr, timeStr] = dateTimeStr.split(' ');
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const [hour, minute] = timeStr.split(':');
    return new Date(year, month - 1, day, hour, minute);
}

/**
 * Parse datetime from format "YYYYMMDD HH:MM" as UTC
 */
export function parseDateTimeUTC(dateTimeStr) {
    const [dateStr, timeStr] = dateTimeStr.split(' ');
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    const [hour, minute] = timeStr.split(':').map(Number);
    return new Date(Date.UTC(year, month, day, hour, minute));
}

/**
 * Format datetime for display
 */
export function formatDateTime(dateTimeStr) {
    const date = parseDateTimeUTC(dateTimeStr);
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

