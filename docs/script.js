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

    // Get all unique test-types
    const testTypes = new Set();
    measures.forEach(measure => {
        if (measure['test-type']) {
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

        // Calculate average latency for each test-type in this hour
        result.testTypes.forEach(testType => {
            const typeMeasures = hourData.measures.filter(m => m['test-type'] === testType && m.status === 'UP');
            if (typeMeasures.length > 0) {
                const avgLatency = typeMeasures.reduce((sum, m) => sum + m.latency, 0) / typeMeasures.length;
                result.data[testType].push(avgLatency);
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

// Create latency chart by test-type
function createLatencyChart(latencyData) {
    const ctx = document.getElementById('latencyChart').getContext('2d');
    const labels = latencyData.hours.map(h => {
        const hour = h.hour;
        return hour.toString().padStart(2, '0') + ':00';
    });
    
    // Define colors for each test-type
    const colors = {
        'bash': '#47b881',
        'curl io': '#3498db',
        'debian package': '#e74c3c',
        // Add more colors for additional test-types if needed
        'default': '#9b59b6'
    };
    
    // Create datasets for each test-type
    const datasets = latencyData.testTypes.map(testType => {
        const color = colors[testType] || colors['default'];
        return {
            label: testType,
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

    const chart = new Chart(ctx, {
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
                        text: 'Latency (sec)'
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
                        text: 'Hour'
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
    
    return chart;
}

// Load and process data
async function loadData() {
    try {
        const response = await fetch('measures.json');
        const measures = await response.json();
        
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
        createLatencyChart(latencyData);
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('status-text').textContent = 'Error loading data';
    }
}

// Load data when page loads
loadData();

