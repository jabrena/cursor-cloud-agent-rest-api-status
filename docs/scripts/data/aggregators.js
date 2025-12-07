import { parseDateTime } from '../utils/dateUtils.js';
import { calculateMedian } from '../utils/mathUtils.js';
import { EXCLUDED_TEST_TYPES } from '../utils/constants.js';

// Aggregate data by day for 90-day chart
export function aggregateByDay(measures) {
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

// Aggregate latency data by day (median) for 1 week (7 days)
export function aggregateLatencyByDayAndType(measures, days) {
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
    const testTypes = new Set();
    measures.forEach(measure => {
        if (measure['test-type'] && !EXCLUDED_TEST_TYPES.includes(measure['test-type'])) {
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
export function aggregateLatencyByHourAndType(measures) {
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
    const testTypes = new Set();
    measures.forEach(measure => {
        if (measure['test-type'] && !EXCLUDED_TEST_TYPES.includes(measure['test-type'])) {
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
export function aggregateByHour(measures) {
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

