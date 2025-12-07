// Load measures data
export async function loadMeasures() {
    const response = await fetch('data/measures.json');
    return await response.json();
}

// Load and display hardware details
export async function loadHardwareDetails() {
    try {
        const response = await fetch('data/hardware.json');
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

