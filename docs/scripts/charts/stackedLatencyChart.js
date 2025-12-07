import { parseDateTimeUTC } from '../utils/dateUtils.js';
import { calculateMedian } from '../utils/mathUtils.js';
import { EXCLUDED_TEST_TYPES, TEST_TYPE_LABELS } from '../utils/constants.js';

// Chart instance management
let stackedLatencyChartInstance = null;

// Get median latency for each test-type from the last 24 hours UTC
// Filters out invalid values where cursor latency > pipeline latency
function getMedianLatencyByTestType24hUTC(measures) {
    const now = new Date();
    const last24HoursUTC = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Filter measures from last 24 hours UTC
    const recentMeasures = measures.filter(m => {
        const date = parseDateTimeUTC(m.localdatetime);
        return date >= last24HoursUTC;
    });
    
    // Get all unique test-types
    const testTypes = new Set();
    recentMeasures.forEach(measure => {
        if (measure['test-type']) {
            testTypes.add(measure['test-type']);
        }
    });
    
    // Calculate median for each test-type, filtering invalid values
    const medianMeasures = {};
    Array.from(testTypes).forEach(testType => {
        const typeMeasures = recentMeasures.filter(m => m['test-type'] === testType);
        
        // Filter out invalid values where cursor-latency > latency
        const validMeasures = typeMeasures.filter(m => {
            const latency = m.latency || 0;
            const cursorLatency = m['cursor-latency'] && m['cursor-latency'] !== '' 
                ? parseFloat(m['cursor-latency']) || 0 
                : 0;
            return cursorLatency <= latency; // Only keep valid measures
        });
        
        if (validMeasures.length > 0) {
            // Calculate median for pipeline latency (total - cursor)
            const pipelineLatencies = validMeasures.map(m => {
                const latency = m.latency || 0;
                const cursorLatency = m['cursor-latency'] && m['cursor-latency'] !== '' 
                    ? parseFloat(m['cursor-latency']) || 0 
                    : 0;
                return latency - cursorLatency;
            });
            
            // Calculate median for cursor latency
            const cursorLatencies = validMeasures.map(m => {
                return m['cursor-latency'] && m['cursor-latency'] !== '' 
                    ? parseFloat(m['cursor-latency']) || 0 
                    : 0;
            });
            
            medianMeasures[testType] = {
                'pipeline-latency': calculateMedian(pipelineLatencies),
                'cursor-latency': calculateMedian(cursorLatencies),
                'latency': calculateMedian(pipelineLatencies) + calculateMedian(cursorLatencies)
            };
        }
    });
    
    return medianMeasures;
}

// Create stacked bar chart for latency by experiment
export function createStackedLatencyChart(measures) {
    const ctx = document.getElementById('stackedLatencyChart').getContext('2d');
    const medianMeasures = getMedianLatencyByTestType24hUTC(measures);
    
    // Define the specific order for test types
    const testTypeOrder = ['bash', 'curl io', 'curl io v2', 'debian package', 'sdkman package', 'java hello world'];
    
    // Exclude curl io v2 and sdkman package
    const excludedTestTypes = ['curl io v2', 'sdkman package'];
    
    // Get test types in the specified order, only including those that have data and are not excluded
    const testTypes = testTypeOrder.filter(testType => 
        medianMeasures.hasOwnProperty(testType) && !excludedTestTypes.includes(testType)
    );
    
    // Prepare data for stacked bar chart
    const latencyData = [];
    const cursorLatencyData = [];
    
    testTypes.forEach(testType => {
        const measure = medianMeasures[testType];
        const pipelineLatency = measure['pipeline-latency'] || 0;
        const cursorLatency = measure['cursor-latency'] || 0;
        
        latencyData.push(pipelineLatency); // Pipeline latency (total - cursor)
        cursorLatencyData.push(cursorLatency); // Cursor latency
    });
    
    // Map labels for display
    const displayLabels = testTypes.map(testType => TEST_TYPE_LABELS[testType] || testType);
    
    // Destroy existing chart instance if it exists
    if (stackedLatencyChartInstance) {
        stackedLatencyChartInstance.destroy();
    }
    
    stackedLatencyChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: displayLabels,
            datasets: [
                {
                    label: 'Pipeline Latency',
                    data: latencyData,
                    backgroundColor: '#3498db',
                    borderColor: '#2980b9',
                    borderWidth: 1
                },
                {
                    label: 'Cursor Latency',
                    data: cursorLatencyData,
                    backgroundColor: '#e74c3c',
                    borderColor: '#c0392b',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    title: {
                        display: true,
                        text: 'Test type'
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Latency (seconds)'
                    },
                    ticks: {
                        callback: function(value) {
                            return value + ' sec';
                        }
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
                            const total = context.datasetIndex === 0 
                                ? value + cursorLatencyData[context.dataIndex]
                                : latencyData[context.dataIndex] + value;
                            return context.dataset.label + ': ' + value.toFixed(2) + ' sec (Total: ' + total.toFixed(2) + ' sec)';
                        }
                    }
                }
            }
        }
    });
    
    return stackedLatencyChartInstance;
}

