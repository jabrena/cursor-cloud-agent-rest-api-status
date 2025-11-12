// Color coding logic
function getStatusColor(status, latency) {
    if (!status) return 'grey';
    if (status === 'DOWN') return 'red';
    if (latency > 60) return 'yellow'; // > 1 minute
    return 'green';
}

function getStatusText(status, latency) {
    if (!status) return 'No data';
    if (status === 'DOWN') return 'Major Outage';
    if (latency > 60) return 'Degraded Performance';
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

// Aggregate data by hour for daily chart
function aggregateByHour(measures) {
    const hourlyData = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Initialize 24 hours
    for (let i = 0; i < 24; i++) {
        hourlyData[i] = { measures: [], status: 'grey' };
    }

    // Add measures to their respective hours
    measures.forEach(measure => {
        const date = parseDateTime(measure.localdatetime);
        const hour = date.getHours();
        if (hourlyData[hour] !== undefined) {
            hourlyData[hour].measures.push(measure);
        }
    });

    // Determine status for each hour
    const result = [];
    for (let i = 0; i < 24; i++) {
        const hourData = hourlyData[i];
        let status = 'grey';
        
        if (hourData.measures.length > 0) {
            let hasDown = false;
            let hasDegraded = false;
            hourData.measures.forEach(m => {
                if (m.status === 'DOWN') hasDown = true;
                else if (m.latency > 60) hasDegraded = true;
            });
            if (hasDown) status = 'red';
            else if (hasDegraded) status = 'yellow';
            else status = 'green';
        }
        
        result.push({
            hour: i,
            status: status,
            count: hourData.measures.length
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
        if (m.status === 'UP' && m.latency <= 60) {
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
    const latest = measures[measures.length - 1];
    const color = getStatusColor(latest.status, latest.latency);
    const text = getStatusText(latest.status, latest.latency);
    const uptime = calculateOverallUptime(measures);
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

    return new Chart(ctx, {
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
            }
        }
    });
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
        const hourlyData = aggregateByHour(measures.filter(m => {
            const date = parseDateTime(m.localdatetime);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return date >= today;
        }));

        // Create charts
        // createHistoryChart(dailyData); // Temporarily disabled - chart removed
        createDailyChart(hourlyData);
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('status-text').textContent = 'Error loading data';
    }
}

// Load data when page loads
loadData();

