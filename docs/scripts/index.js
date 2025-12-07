import { parseDateTime } from './utils/dateUtils.js';
import { aggregateByDay, aggregateByHour, aggregateLatencyByHourAndType, aggregateLatencyByDayAndType } from './data/aggregators.js';
import { createDailyChart } from './charts/dailyChart.js';
import { createLatencyChart } from './charts/latencyChart.js';
import { createStackedLatencyChart } from './charts/stackedLatencyChart.js';
import { loadMeasures, loadHardwareDetails } from './api/dataLoader.js';
import { updateStatusBanner, showStatusBannerError } from './ui/statusBanner.js';

// Global state
let allMeasures = [];

// Update latency chart based on selected time period
function updateLatencyChart(timePeriod) {
    if (allMeasures.length === 0) return;
    
    const now = new Date();
    let latencyData;
    
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
        const measures = await loadMeasures();
        allMeasures = measures; // Store globally for time period updates
        
        // Update status banner
        updateStatusBanner(measures);

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
        showStatusBannerError('Error loading data');
    }
}

// Initialize on page load
loadData();
loadHardwareDetails();
