/**
 * Calculate median of an array of numbers
 */
export function calculateMedian(values) {
    if (values.length === 0) return null;
    const sorted = values.filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
        ? (sorted[mid - 1] + sorted[mid]) / 2 
        : sorted[mid];
}

