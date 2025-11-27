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
    
    // Convert UTC hours to different timezones (using standard time offsets)
    // ET: UTC-5 (EST), CT: UTC-6 (CST), PT: UTC-8 (PST), CET: UTC+1
    const getETHour = (utcHour) => {
        return (utcHour - 5 + 24) % 24; // UTC-5
    };
    
    const getCTHour = (utcHour) => {
        return (utcHour - 6 + 24) % 24; // UTC-6
    };
    
    const getPTHour = (utcHour) => {
        return (utcHour - 8 + 24) % 24; // UTC-8
    };
    
    const getCETHour = (utcHour) => {
        return (utcHour + 1) % 24; // UTC+1
    };
    
    const getISTHour = (utcHour) => {
        // IST: UTC+5:30, approximate to nearest hour
        // UTC 3:30 = IST 9:00, UTC 4:30 = IST 10:00, etc.
        // For hourly approximation: UTC 4-11 maps to IST 9-17
        return (utcHour + 5) % 24; // Approximate UTC+5:30 as UTC+5
    };
    
    const getCSTHour = (utcHour) => {
        return (utcHour + 8) % 24; // UTC+8 (China Standard Time)
    };
    
    const getJSTHour = (utcHour) => {
        return (utcHour + 9) % 24; // UTC+9
    };
    
    // Track which hours should have bars for each timezone (9-17 local time)
    const etBarHours = latencyData.hours.map(h => {
        const etHour = getETHour(h.hour);
        return etHour >= 9 && etHour <= 17;
    });
    
    const ctBarHours = latencyData.hours.map(h => {
        const ctHour = getCTHour(h.hour);
        return ctHour >= 9 && ctHour <= 17;
    });
    
    const ptBarHours = latencyData.hours.map(h => {
        const ptHour = getPTHour(h.hour);
        return ptHour >= 9 && ptHour <= 17;
    });
    
    const cetBarHours = latencyData.hours.map(h => {
        const cetHour = getCETHour(h.hour);
        return cetHour >= 9 && cetHour <= 17;
    });
    
    const istBarHours = latencyData.hours.map(h => {
        // IST: UTC+5:30
        // UTC 3:30 = IST 9:00, UTC 11:30 = IST 17:00
        // For hourly approximation: UTC 3-11 maps to IST 9-17
        // More precisely: UTC hour 3 (3:00-3:59) ≈ IST 8:30-9:29 (rounds to 9)
        //                 UTC hour 11 (11:00-11:59) ≈ IST 16:30-17:29 (rounds to 17)
        return h.hour >= 3 && h.hour <= 11;
    });
    
    const cstBarHours = latencyData.hours.map(h => {
        const cstHour = getCSTHour(h.hour);
        return cstHour >= 9 && cstHour <= 17;
    });
    
    const jstBarHours = latencyData.hours.map(h => {
        const jstHour = getJSTHour(h.hour);
        return jstHour >= 9 && jstHour <= 17;
    });
    
    // Define colors for each test-type
    const colors = {
        'bash': '#47b881',
        'curl io': '#3498db',
        'curl io v2': '#9b59b6',
        'debian package': '#e74c3c',
        'java hello world': '#f39c12',
        'sdkman package': '#1abc9c',
        // Fallback for any unknown test-types
        'default': '#95a5a6'
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

    // Plugin to draw timezone rows and legend
    const timezonePlugin = {
        id: 'timezonePlugin',
        afterDraw: (chart) => {
            const ctx = chart.ctx;
            const chartArea = chart.chartArea;
            const xScale = chart.scales.x;
            const xAxisBottom = xScale.bottom;
            const rowHeight = 12.5; // Half of original height (25/2)
            const rowSpacing = 3; // Space between timezone rows
            const spacing = 5; // Space between x-axis labels and first timezone row
            const legendSpacing = 8; // Space between timezone rows and legend
            
            // Timezone colors
            const timezoneColors = {
                et: '#2E86AB',  // Blue for Eastern Time
                ct: '#F18F01',  // Orange for Central Time
                pt: '#C77DFF',  // Purple for Pacific Time
                cet: '#006994',  // Marine blue for CET
                ist: '#FF6B6B',  // Red for India Standard Time
                cst: '#4ECDC4',  // Teal for China Standard Time
                jst: '#95E1D3'   // Light teal for Japan Standard Time
            };
            
            // Timezone configurations (order: ET, CT, PT, CET, IST, CST, JST)
            const timezones = [
                { name: 'ET', label: 'Eastern Time (ET)', hours: etBarHours, color: timezoneColors.et, offset: 'UTC-5/UTC-4' },
                { name: 'CT', label: 'Central Time (CT)', hours: ctBarHours, color: timezoneColors.ct, offset: 'UTC-6/UTC-5' },
                { name: 'PT', label: 'Pacific Time (PT)', hours: ptBarHours, color: timezoneColors.pt, offset: 'UTC-8/UTC-7' },
                { name: 'CET', label: 'CET', hours: cetBarHours, color: timezoneColors.cet, offset: 'UTC+1' },
                { name: 'IST', label: 'IST', hours: istBarHours, color: timezoneColors.ist, offset: 'UTC+5:30' },
                { name: 'CST', label: 'CST', hours: cstBarHours, color: timezoneColors.cst, offset: 'UTC+8' },
                { name: 'JST', label: 'JST', hours: jstBarHours, color: timezoneColors.jst, offset: 'UTC+9' }
            ];
            
            ctx.save();
            
            // Calculate width of each hour segment
            const firstX = xScale.getPixelForValue(0);
            const secondX = xScale.getPixelForValue(1);
            const segmentWidth = secondX - firstX;
            
            // Draw timezone bars (stacked vertically)
            timezones.forEach((tz, tzIndex) => {
                const rowTop = xAxisBottom + spacing + (tzIndex * (rowHeight + rowSpacing));
                
                labels.forEach((label, index) => {
                    if (tz.hours[index]) {
                        const x = xScale.getPixelForValue(index);
                        const segmentLeft = x - segmentWidth / 2;
                        
                        // Draw rectangle for this hour segment
                        ctx.fillStyle = tz.color;
                        ctx.fillRect(segmentLeft, rowTop, segmentWidth, rowHeight);
                    }
                });
            });
            
            // Draw legend below all timezone rows
            const totalRowsHeight = timezones.length * rowHeight + (timezones.length - 1) * rowSpacing;
            const legendTop = xAxisBottom + spacing + totalRowsHeight + legendSpacing;
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            // Draw legend items
            const legendRectSize = 15;
            const legendItemSpacing = 20;
            let legendX = chartArea.left;
            const legendY = legendTop;
            
            timezones.forEach((tz, index) => {
                // Draw colored rectangle for legend indicator
                ctx.fillStyle = tz.color;
                ctx.fillRect(legendX, legendY, legendRectSize, legendRectSize);
                
                // Draw legend text - only timezone abbreviation
                ctx.fillStyle = '#000000';
                const legendText = tz.name;
                ctx.fillText(legendText, legendX + legendRectSize + 8, legendY + 1);
                
                // Move to next legend item (if not last)
                if (index < timezones.length - 1) {
                    const textWidth = ctx.measureText(legendText).width;
                    legendX += legendRectSize + 8 + textWidth + legendItemSpacing;
                }
            });
            
            ctx.restore();
        }
    };

    const chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        plugins: [timezonePlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    bottom: 180 // Add padding at bottom for 7 timezone rows and legend
                }
            },
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

