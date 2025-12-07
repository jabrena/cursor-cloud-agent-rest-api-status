import { getStatusText } from '../utils/statusUtils.js';
import { STATUS_COLORS } from '../utils/constants.js';

// Create daily chart
export function createDailyChart(hourlyData) {
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
        if (h.status === 'red') return STATUS_COLORS.red;
        if (h.status === 'yellow') return STATUS_COLORS.yellow;
        if (h.status === 'green') return STATUS_COLORS.green;
        return STATUS_COLORS.grey;
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

