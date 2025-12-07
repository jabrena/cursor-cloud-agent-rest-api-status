import { TEST_TYPE_ORDER, TEST_TYPE_COLORS, TEST_TYPE_LABELS } from '../utils/constants.js';

// Chart instance management
let latencyChartInstance = null;

// Create latency chart by test-type
export function createLatencyChart(latencyData, timePeriod = '24h') {
    const ctx = document.getElementById('latencyChart').getContext('2d');
    
    // Determine labels and x-axis title based on time period
    let labels;
    let xAxisTitle;
    
    if (timePeriod === '24h' && latencyData.hours) {
        // Hourly data for 24h
        labels = latencyData.hours.map(h => {
            const hour = h.hour;
            return hour.toString().padStart(2, '0') + ':00';
        });
        xAxisTitle = 'Hour (UTC)';
    } else if (latencyData.days) {
        // Daily data for 1 week or 1 month
        labels = latencyData.days.map(d => {
            const date = d.date;
            const month = date.toLocaleString('default', { month: 'short' });
            const day = date.getDate();
            return `${month} ${day}`;
        });
        xAxisTitle = 'Day';
    } else {
        // Fallback to hours if structure is unexpected
        labels = latencyData.hours ? latencyData.hours.map(h => {
            const hour = h.hour;
            return hour.toString().padStart(2, '0') + ':00';
        }) : [];
        xAxisTitle = 'Hour (UTC)';
    }
    
    // Sort test types according to the desired order
    const sortedTestTypes = [...latencyData.testTypes].sort((a, b) => {
        const indexA = TEST_TYPE_ORDER.indexOf(a);
        const indexB = TEST_TYPE_ORDER.indexOf(b);
        // If both are in the order, sort by their position
        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }
        // If only one is in the order, prioritize it
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        // If neither is in the order, maintain original order
        return latencyData.testTypes.indexOf(a) - latencyData.testTypes.indexOf(b);
    });
    
    // Create datasets for each test-type in the sorted order
    const datasets = sortedTestTypes.map(testType => {
        const color = TEST_TYPE_COLORS[testType] || TEST_TYPE_COLORS['default'];
        const displayLabel = TEST_TYPE_LABELS[testType] || testType;
        return {
            label: displayLabel,
            data: latencyData.data[testType],
            borderColor: color,
            backgroundColor: color + '20', // Add transparency
            borderWidth: 2,
            fill: false,
            tension: 0.1, // Smooth curves
            pointRadius: 3,
            pointHoverRadius: 5,
            spanGaps: true // Connect points even when there's missing data
        };
    });

    // Calculate minimum value across all datasets
    let minValue = Infinity;
    datasets.forEach(dataset => {
        dataset.data.forEach(value => {
            if (value !== null && value !== undefined && !isNaN(value)) {
                minValue = Math.min(minValue, value);
            }
        });
    });
    
    // If no valid data, default to 0
    if (minValue === Infinity) {
        minValue = 0;
    }
    
    // Configure y-axis: if min is greater than 20, start from 20
    const yAxisConfig = {
        title: {
            display: true,
            text: 'Pipeline Latency (sec)'
        },
        ticks: {
            callback: function(value) {
                return value + ' sec';
            }
        }
    };
    
    if (minValue > 20) {
        yAxisConfig.beginAtZero = false;
        yAxisConfig.min = 20;
    } else {
        yAxisConfig.beginAtZero = true;
    }

    // Destroy existing chart if it exists
    if (latencyChartInstance) {
        latencyChartInstance.destroy();
    }

    latencyChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: yAxisConfig,
                x: {
                    title: {
                        display: true,
                        text: xAxisTitle
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y;
                            if (value === null) {
                                return context.dataset.label + ': No data';
                            }
                            return context.dataset.label + ': ' + value.toFixed(2) + ' sec';
                        }
                    }
                }
            }
        }
    });
    
    return latencyChartInstance;
}

