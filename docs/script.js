// Color coding logic
function getStatusColor(status, latency) {
    if (!status) return 'grey';
    if (status === 'DOWN') return 'red';
    return 'green';
}

function getStatusText(status, latency) {
    if (!status) return 'No data';
    if (status === 'DOWN') return 'Major Outage';
    return 'Operational';
}

// Parse datetime from format "YYYYMMDD HH:MM"
function parseDateTime(dateTimeStr) {
    const [dateStr, timeStr] = dateTimeStr.split(' ');
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    const [hour, minute] = timeStr.split(':');
    return new Date(year, month - 1, day, hour, minute);
}

// Aggregate data by day for 90-day chart
function aggregateByDay(measures) {
    const dailyData = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Initialize 90 days of data
    for (let i = 89; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        dailyData[dateKey] = { measures: [], uptime: 0, total: 0 };
    }

    // Add measures to their respective days
    measures.forEach(measure => {
        const date = parseDateTime(measure.localdatetime);
        const dateKey = date.toISOString().split('T')[0];
        if (dailyData[dateKey]) {
            dailyData[dateKey].measures.push(measure);
            dailyData[dateKey].total++;
            if (measure.status === 'UP' && measure.latency <= 60) {
                dailyData[dateKey].uptime++;
            }
        }
    });

    // Calculate uptime percentage for each day
    const result = [];
    for (let i = 89; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        const dayData = dailyData[dateKey];
        
        let status = 'grey';
        let uptime = 0;
        
        if (dayData.total > 0) {
            uptime = (dayData.uptime / dayData.total) * 100;
            // Determine worst status for the day
            let hasDown = false;
            let hasDegraded = false;
            dayData.measures.forEach(m => {
                if (m.status === 'DOWN') hasDown = true;
                else if (m.latency > 60) hasDegraded = true;
            });
            if (hasDown) status = 'red';
            else if (hasDegraded) status = 'yellow';
            else status = 'green';
        }
        
        result.push({
            date: date,
            dateKey: dateKey,
            uptime: uptime,
            status: status,
            total: dayData.total
        });
    }

    return result;
}

// Helper function to calculate median
function calculateMedian(values) {
    if (values.length === 0) return null;
    const sorted = values.filter(v => v !== null && v !== undefined).sort((a, b) => a - b);
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 
        ? (sorted[mid - 1] + sorted[mid]) / 2 
        : sorted[mid];
}

// Aggregate latency data by day (median) for 1 week (7 days)
function aggregateLatencyByDayAndType(measures, days) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    // Create a map to store daily data
    const dailyData = {};
    
    // Initialize days (from N days ago to today)
    for (let i = 0; i < days; i++) {
        const daysBack = days - 1 - i; // days-1, days-2, ..., 1, 0
        const slotDate = new Date(now);
        slotDate.setDate(now.getDate() - daysBack);
        slotDate.setHours(0, 0, 0, 0);
        
        const dateKey = slotDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        dailyData[dateKey] = { 
            measures: [], 
            date: new Date(slotDate)
        };
    }

    // Add measures to their respective days
    measures.forEach(measure => {
        const measureDate = parseDateTime(measure.localdatetime);
        measureDate.setHours(0, 0, 0, 0);
        const dateKey = measureDate.toISOString().split('T')[0];
        
        if (dailyData[dateKey]) {
            dailyData[dateKey].measures.push(measure);
        }
    });

    // Get all unique test-types, excluding curl io v2 and sdkman package
    const excludedTestTypes = ['curl io v2', 'sdkman package'];
    const testTypes = new Set();
    measures.forEach(measure => {
        if (measure['test-type'] && !excludedTestTypes.includes(measure['test-type'])) {
            testTypes.add(measure['test-type']);
        }
    });

    // Build result structure: for each day, calculate median latency per test-type
    const result = {
        days: [],
        testTypes: Array.from(testTypes),
        data: {}
    };

    // Initialize data structure for each test-type
    result.testTypes.forEach(testType => {
        result.data[testType] = [];
    });

    // Process each day
    for (let i = 0; i < days; i++) {
        const daysBack = days - 1 - i; // days-1, days-2, ..., 1, 0
        const slotDate = new Date(now);
        slotDate.setDate(now.getDate() - daysBack);
        slotDate.setHours(0, 0, 0, 0);
        
        const dateKey = slotDate.toISOString().split('T')[0];
        const dayData = dailyData[dateKey] || { 
            measures: [], 
            date: new Date(slotDate) 
        };
        
        result.days.push({
            date: dayData.date
        });

        // Calculate median latency for each test-type in this day
        result.testTypes.forEach(testType => {
            const typeMeasures = dayData.measures.filter(m => m['test-type'] === testType && m.status === 'UP');
            if (typeMeasures.length > 0) {
                const latencies = typeMeasures.map(m => m.latency).filter(l => l !== null && l !== undefined);
                const median = calculateMedian(latencies);
                result.data[testType].push(median);
            } else {
                result.data[testType].push(null); // No data for this day/test-type combination
            }
        });
    }

    return result;
}

// Aggregate latency data by hour and test-type for latency chart
function aggregateLatencyByHourAndType(measures) {
    const now = new Date();
    
    // Create a map to store hourly data for the last 24 hours
    const hourlyData = {};
    
    // Initialize 24 hours (from 24 hours ago to current hour)
    for (let i = 0; i < 24; i++) {
        const hoursBack = 23 - i; // 23, 22, ..., 1, 0
        const slotDate = new Date(now);
        slotDate.setHours(now.getHours() - hoursBack, 0, 0, 0);
        
        const hourKey = slotDate.toISOString().slice(0, 13); // YYYY-MM-DDTHH format
        hourlyData[hourKey] = { 
            measures: [], 
            hour: slotDate.getHours(),
            date: new Date(slotDate)
        };
    }

    // Add measures to their respective hours
    measures.forEach(measure => {
        const measureDate = parseDateTime(measure.localdatetime);
        const hourKey = measureDate.toISOString().slice(0, 13); // YYYY-MM-DDTHH format
        
        if (hourlyData[hourKey]) {
            hourlyData[hourKey].measures.push(measure);
        }
    });

    // Get all unique test-types, excluding curl io v2 and sdkman package
    const excludedTestTypes = ['curl io v2', 'sdkman package'];
    const testTypes = new Set();
    measures.forEach(measure => {
        if (measure['test-type'] && !excludedTestTypes.includes(measure['test-type'])) {
            testTypes.add(measure['test-type']);
        }
    });

    // Build result structure: for each hour, calculate average latency per test-type
    const result = {
        hours: [],
        testTypes: Array.from(testTypes),
        data: {}
    };

    // Initialize data structure for each test-type
    result.testTypes.forEach(testType => {
        result.data[testType] = [];
    });

    // Process each hour
    for (let i = 0; i < 24; i++) {
        const hoursBack = 23 - i; // 23, 22, ..., 1, 0
        const slotDate = new Date(now);
        slotDate.setHours(now.getHours() - hoursBack, 0, 0, 0);
        
        const hourKey = slotDate.toISOString().slice(0, 13);
        const hourData = hourlyData[hourKey] || { 
            measures: [], 
            hour: slotDate.getHours(), 
            date: new Date(slotDate) 
        };
        
        result.hours.push({
            hour: hourData.hour,
            date: hourData.date
        });

        // Calculate latency for each test-type in this hour (use last measure's latency)
        result.testTypes.forEach(testType => {
            const typeMeasures = hourData.measures.filter(m => m['test-type'] === testType && m.status === 'UP');
            if (typeMeasures.length > 0) {
                // Sort measures by time (ascending) and take the last one (most recent)
                typeMeasures.sort((a, b) => {
                    const dateA = parseDateTime(a.localdatetime);
                    const dateB = parseDateTime(b.localdatetime);
                    return dateA - dateB;
                });
                const lastMeasure = typeMeasures[typeMeasures.length - 1];
                result.data[testType].push(lastMeasure.latency);
            } else {
                result.data[testType].push(null); // No data for this hour/test-type combination
            }
        });
    }

    return result;
}

// Aggregate data by hour for daily chart (rolling 24 hours)
function aggregateByHour(measures) {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Create a map to store hourly data for the last 24 hours
    const hourlyData = {};
    
    // Initialize 24 hours (from 24 hours ago to current hour)
    // Going back from current hour: currentHour-23, currentHour-22, ..., currentHour-1, currentHour
    for (let i = 0; i < 24; i++) {
        const hoursBack = 23 - i; // 23, 22, ..., 1, 0
        const slotDate = new Date(now);
        slotDate.setHours(now.getHours() - hoursBack, 0, 0, 0);
        
        const hourKey = slotDate.toISOString().slice(0, 13); // YYYY-MM-DDTHH format
        hourlyData[hourKey] = { 
            measures: [], 
            status: 'grey',
            hour: slotDate.getHours(),
            date: new Date(slotDate)
        };
    }

    // Add measures to their respective hours
    measures.forEach(measure => {
        const measureDate = parseDateTime(measure.localdatetime);
        const hourKey = measureDate.toISOString().slice(0, 13); // YYYY-MM-DDTHH format
        
        if (hourlyData[hourKey]) {
            hourlyData[hourKey].measures.push(measure);
        }
    });

    // Build result array ordered from oldest (left) to newest (right)
    const result = [];
    for (let i = 0; i < 24; i++) {
        const hoursBack = 23 - i; // 23, 22, ..., 1, 0
        const slotDate = new Date(now);
        slotDate.setHours(now.getHours() - hoursBack, 0, 0, 0);
        
        const hourKey = slotDate.toISOString().slice(0, 13);
        const hourData = hourlyData[hourKey] || { 
            measures: [], 
            status: 'grey', 
            hour: slotDate.getHours(), 
            date: new Date(slotDate) 
        };
        
        let status = 'grey';
        
        if (hourData.measures.length > 0) {
            // Determine status for the hour based on DOWN status only
            // Count measures that are not UP (i.e., DOWN)
            const downCount = hourData.measures.filter(m => m.status !== 'UP').length;
            const halfThreshold = hourData.measures.length / 2;
            
            if (downCount > halfThreshold) {
                // More than half are DOWN -> DOWN status
                status = 'red';
            } else if (downCount > 0) {
                // At least one is DOWN but not more than half -> DEGRADED
                status = 'yellow';
            } else {
                // All are UP -> OPERATIONAL
                status = 'green';
            }
        }
        
        result.push({
            hour: hourData.hour,
            status: status,
            count: hourData.measures.length,
            date: hourData.date
        });
    }

    return result;
}

// Calculate overall uptime for last 24 hours
function calculateOverallUptime(measures) {
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
function getCurrentStatus(measures) {
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

// Create history chart
function createHistoryChart(dailyData) {
    const ctx = document.getElementById('historyChart').getContext('2d');
    const labels = dailyData.map(d => {
        const month = d.date.toLocaleString('default', { month: 'short' });
        const day = d.date.getDate();
        return `${month} ${day}`;
    });
    
    const uptimeData = dailyData.map(d => d.uptime);
    const backgroundColors = dailyData.map(d => {
        if (d.status === 'red') return '#d04437';
        if (d.status === 'yellow') return '#f5a623';
        if (d.status === 'green') return '#47b881';
        return '#ccc';
    });

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Uptime %',
                data: uptimeData,
                backgroundColor: backgroundColors,
                borderColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dayData = dailyData[context.dataIndex];
                            return `Uptime: ${dayData.uptime.toFixed(2)}% (${dayData.total} measures)`;
                        }
                    }
                }
            }
        }
    });
}

// Create daily chart
function createDailyChart(hourlyData) {
    const ctx = document.getElementById('dailyChart').getContext('2d');
    const labels = hourlyData.map(h => {
        const hour = h.hour;
        return hour.toString().padStart(2, '0') + ':00';
    });
    
    const statusValues = hourlyData.map(h => {
        if (h.status === 'red') return 3;
        if (h.status === 'yellow') return 2;
        if (h.status === 'green') return 1;
        return 0;
    });
    
    const backgroundColors = hourlyData.map(h => {
        if (h.status === 'red') return '#d04437';
        if (h.status === 'yellow') return '#f5a623';
        if (h.status === 'green') return '#47b881';
        return '#ccc';
    });

    const chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Status',
                data: statusValues,
                backgroundColor: backgroundColors,
                borderColor: backgroundColors,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 3,
                    ticks: {
                        stepSize: 1,
                        callback: function(value) {
                            if (value === 0) return 'No data';
                            if (value === 1) return 'Operational';
                            if (value === 2) return 'Degraded';
                            if (value === 3) return 'Down';
                            return '';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const hourData = hourlyData[context.dataIndex];
                            const statusText = getStatusText(
                                hourData.status === 'red' ? 'DOWN' : 'UP',
                                hourData.status === 'yellow' ? 61 : 0
                            );
                            return `${statusText} (${hourData.count} measures)`;
                        }
                    }
                }
            },
            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const clickedIndex = elements[0].index;
                    const hour = hourlyData[clickedIndex].hour;
                    if (hourlyData[clickedIndex].count > 0) {
                        window.location.href = `detail.html?hour=${hour}`;
                    }
                }
            },
            onHover: (event, elements) => {
                event.native.target.style.cursor = elements.length > 0 && hourlyData[elements[0].index].count > 0 
                    ? 'pointer' 
                    : 'default';
            }
        }
    });
    
    return chart;
}

// Global variable to store latency chart instance and measures data
let latencyChartInstance = null;
let allMeasures = [];

// Create latency chart by test-type
function createLatencyChart(latencyData, timePeriod = '24h') {
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
        xAxisTitle = 'Hour';
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
        xAxisTitle = 'Hour';
    }
    
    // Define colors for each test-type - using distinct colors for maximum contrast
    const colors = {
        'bash': '#2ecc71',           // Green
        'curl io': '#3498db',         // Blue
        'curl io v2': '#9b59b6',      // Purple
        'debian package': '#e74c3c',   // Red
        'java hello world': '#f39c12', // Orange
        'sdkman package': '#16a085',  // Teal (distinct from green and red)
        // Fallback for any unknown test-types
        'default': '#95a5a6'
    };
    
    // Map test-type names to display labels
    const labelMap = {
        'debian package': 'java 25'
    };
    
    // Create datasets for each test-type
    const datasets = latencyData.testTypes.map(testType => {
        const color = colors[testType] || colors['default'];
        const displayLabel = labelMap[testType] || testType;
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
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Pipeline Latency (sec)'
                    },
                    ticks: {
                        callback: function(value) {
                            return value + ' sec';
                        }
                    }
                },
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
                    position: 'top'
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

// Get last measure for each test-type from the last 24 hours
function getLastMeasuresByTestType(measures) {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Filter measures from last 24 hours
    const recentMeasures = measures.filter(m => {
        const date = parseDateTime(m.localdatetime);
        return date >= last24Hours;
    });
    
    // Get all unique test-types
    const testTypes = new Set();
    recentMeasures.forEach(measure => {
        if (measure['test-type']) {
            testTypes.add(measure['test-type']);
        }
    });
    
    // Get last measure for each test-type
    const lastMeasures = {};
    Array.from(testTypes).forEach(testType => {
        const typeMeasures = recentMeasures.filter(m => m['test-type'] === testType);
        if (typeMeasures.length > 0) {
            // Sort by datetime (ascending) and take the last one (most recent)
            typeMeasures.sort((a, b) => {
                const dateA = parseDateTime(a.localdatetime);
                const dateB = parseDateTime(b.localdatetime);
                return dateA - dateB;
            });
            lastMeasures[testType] = typeMeasures[typeMeasures.length - 1];
        }
    });
    
    return lastMeasures;
}

// Create stacked bar chart for latency by experiment
function createStackedLatencyChart(measures) {
    const ctx = document.getElementById('stackedLatencyChart').getContext('2d');
    const lastMeasures = getLastMeasuresByTestType(measures);
    
    // Define the specific order for test types
    const testTypeOrder = ['bash', 'curl io', 'curl io v2', 'debian package', 'sdkman package', 'java hello world'];
    
    // Exclude curl io v2 and sdkman package
    const excludedTestTypes = ['curl io v2', 'sdkman package'];
    
    // Get test types in the specified order, only including those that have data and are not excluded
    const testTypes = testTypeOrder.filter(testType => 
        lastMeasures.hasOwnProperty(testType) && !excludedTestTypes.includes(testType)
    );
    
    // Map test-type names to display labels
    const labelMap = {
        'debian package': 'java 25'
    };
    
    // Prepare data for stacked bar chart
    const latencyData = [];
    const cursorLatencyData = [];
    
    testTypes.forEach(testType => {
        const measure = lastMeasures[testType];
        const latency = measure.latency || 0;
        const cursorLatency = measure['cursor-latency'] && measure['cursor-latency'] !== '' 
            ? parseFloat(measure['cursor-latency']) || 0 
            : 0;
        
        latencyData.push(latency - cursorLatency); // Pipeline latency (total - cursor)
        cursorLatencyData.push(cursorLatency); // Cursor latency
    });
    
    // Map labels for display
    const displayLabels = testTypes.map(testType => labelMap[testType] || testType);
    
    const chart = new Chart(ctx, {
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
                    position: 'top'
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
    
    return chart;
}

// Load and display hardware details
async function loadHardwareDetails() {
    try {
        const response = await fetch('hardware.json');
        const hardware = await response.json();
        const container = document.getElementById('hardware-details-container');
        
        if (!hardware || hardware.length === 0) {
            container.innerHTML = '<p>No hardware details available</p>';
            return;
        }
        
        // Get the last entry (most recent)
        const lastEntry = hardware[hardware.length - 1];
        
        // Create table
        let tableHTML = '<table class="hardware-table">';
        
        // System information
        tableHTML += '<tr><th colspan="2">System Information</th></tr>';
        tableHTML += `<tr><td>AWS Region</td><td>${lastEntry['aws-region'] || 'N/A'}</td></tr>`;
        tableHTML += `<tr><td>CPU Architecture</td><td>${lastEntry['cpu-architecture'] || 'N/A'}</td></tr>`;
        tableHTML += `<tr><td>Processing Units</td><td>${lastEntry['processing-units'] || 'N/A'}</td></tr>`;
        tableHTML += `<tr><td>System Information</td><td>${lastEntry['system-information'] || 'N/A'}</td></tr>`;
        tableHTML += `<tr><td>RAM Usage and Total Memory</td><td>${lastEntry['ram-usage-and-total-memory'] || 'N/A'}</td></tr>`;
        tableHTML += `<tr><td>Disk Space Usage</td><td>${lastEntry['disk-space-usage'] || 'N/A'}</td></tr>`;
        
        // Development tools
        tableHTML += '<tr><th colspan="2">Development Tools</th></tr>';
        tableHTML += `<tr><td>Java Version</td><td>${lastEntry['java-version'] || 'N/A'}</td></tr>`;
        tableHTML += `<tr><td>Maven Version</td><td>${lastEntry['maven-version'] || 'N/A'}</td></tr>`;
        if (lastEntry['gradle-version']) {
            tableHTML += `<tr><td>Gradle Version</td><td>${lastEntry['gradle-version'] || 'N/A'}</td></tr>`;
        }
        
        tableHTML += '</table>';
        container.innerHTML = tableHTML;
    } catch (error) {
        console.error('Error loading hardware details:', error);
        document.getElementById('hardware-details-container').innerHTML = '<p>Error loading hardware details</p>';
    }
}

// Update latency chart based on selected time period
function updateLatencyChart(timePeriod) {
    if (allMeasures.length === 0) return;
    
    const now = new Date();
    let latencyData;
    let headingText;
    
    if (timePeriod === '24h') {
        // Last 24 hours - hourly data
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const recentMeasures = allMeasures.filter(m => {
            const date = parseDateTime(m.localdatetime);
            return date >= last24Hours;
        });
        latencyData = aggregateLatencyByHourAndType(recentMeasures);
    } else if (timePeriod === '1week') {
        // 1 Week - median of previous 7 days
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const recentMeasures = allMeasures.filter(m => {
            const date = parseDateTime(m.localdatetime);
            return date >= last7Days;
        });
        latencyData = aggregateLatencyByDayAndType(recentMeasures, 7);
    } else if (timePeriod === '1month') {
        // 1 Month - median of last 30 days
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const recentMeasures = allMeasures.filter(m => {
            const date = parseDateTime(m.localdatetime);
            return date >= last30Days;
        });
        latencyData = aggregateLatencyByDayAndType(recentMeasures, 30);
    }
    
    // Update chart
    createLatencyChart(latencyData, timePeriod);
}

// Load and process data
async function loadData() {
    try {
        const response = await fetch('measures.json');
        const measures = await response.json();
        allMeasures = measures; // Store globally for time period updates
        
        // Update status banner
        const currentStatus = getCurrentStatus(measures);
        const banner = document.getElementById('status-banner');
        const statusText = document.getElementById('status-text');
        const uptimeInfo = document.getElementById('uptime-info');
        
        banner.className = `status-banner ${currentStatus.status}`;
        statusText.textContent = currentStatus.text === 'No data available' 
            ? 'No data available' 
            : `All Systems ${currentStatus.text === 'Operational' ? 'Operational' : currentStatus.text}`;
        
        if (measures.length > 0) {
            uptimeInfo.textContent = `Uptime over the last 24 hours: ${currentStatus.uptime.toFixed(2)}%`;
        } else {
            uptimeInfo.textContent = 'No measures available';
        }

        // Aggregate data
        const dailyData = aggregateByDay(measures);
        // Filter measures from last 24 hours
        const now = new Date();
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const recentMeasures = measures.filter(m => {
            const date = parseDateTime(m.localdatetime);
            return date >= last24Hours;
        });
        const hourlyData = aggregateByHour(recentMeasures);
        const latencyData = aggregateLatencyByHourAndType(recentMeasures);

        // Create charts
        // createHistoryChart(dailyData); // Temporarily disabled - chart removed
        createDailyChart(hourlyData);
        createLatencyChart(latencyData, '24h');
        createStackedLatencyChart(measures);
        
        // Add event listeners for radio buttons
        const radioButtons = document.querySelectorAll('input[name="timePeriod"]');
        radioButtons.forEach(radio => {
            radio.addEventListener('change', function() {
                updateLatencyChart(this.value);
            });
        });
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('status-text').textContent = 'Error loading data';
    }
}

// Load data when page loads
loadData();
loadHardwareDetails();

