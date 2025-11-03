// =============================================================================
// script.js: FINAL ROBUST & SIMPLE DATA FETCH VERSION
// =============================================================================

const SHEET_API_URL = "/api"; 
let currentProjectID = null; 
let allProjects = [];

// --- UTILITY (CRITICAL API FIX) ---
function showMessageBox(message, type) {
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
    // You can replace this with a simple alert(message); if you prefer
}

async function sendDataToSheet(sheetName, method, data = {}) {
    let payload = { sheetName, method, ...data }; // CRITICAL: Merge data at top level for Apps Script

    try {
        const response = await fetch(SHEET_API_URL, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        
        // This is necessary because Apps Script often returns text/plain even for JSON
        const text = await response.text(); 
        try {
            return JSON.parse(text);
        } catch(e) {
            console.error("Failed to parse response as JSON:", text);
            return { status: 'error', message: "API returned non-JSON response." };
        }

    } catch (error) {
        console.error(`API Error:`, error);
        return { status: 'error', message: error.message };
    }
}

// --- PROJECT & UI MANAGEMENT ---
const projectSelector = document.getElementById('projectSelector');
const currentProjectName = document.getElementById('currentProjectName');

async function loadProjects() {
    const result = await sendDataToSheet('Projects', 'GET');

    if (result.status === 'success' && Array.isArray(result.data)) {
        allProjects = result.data;
        projectSelector.innerHTML = '<option value="">-- Select Project --</option>';

        allProjects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.ProjectID;
            option.textContent = project.ProjectName;
            projectSelector.appendChild(option);
        });

        if (allProjects.length > 0) {
            currentProjectID = allProjects[0].ProjectID;
            projectSelector.value = currentProjectID;
            await loadDashboardData();
        }
    } else {
        console.error("Failed to load projects:", result.message);
        currentProjectName.textContent = 'ERROR: Cannot load projects.';
    }
}

projectSelector.addEventListener('change', async (e) => {
    currentProjectID = e.target.value;
    if (currentProjectID) {
        await loadDashboardData();
    }
});

async function loadDashboardData() {
    if (!currentProjectID) return;

    // 1. Get Project Details
    const projectResult = await sendDataToSheet('Projects', 'GET', { ProjectID: currentProjectID });
    // Assuming Apps Script returns a single object if ProjectID is specified
    const project = (projectResult.status === 'success' && projectResult.data) ? projectResult.data : null; 
    
    // 2. Render Data
    if (project) {
        currentProjectName.textContent = project.ProjectName;
        renderProjectDetails(project);
        // You would load and render other data (Tasks, Expenses, KPIs) here
    } else {
        currentProjectName.textContent = 'Project Not Found';
        renderProjectDetails(null);
    }
}

// --- RENDERING FUNCTIONS (WITH CRITICAL NULL CHECKS) ---

function renderProjectDetails(project) {
    // If project is null (e.g., failed fetch), clear the display and stop
    if (!project) {
        document.getElementById('projectDetailsDisplay').innerHTML = '<p>No details available.</p>';
        return;
    }

    // CRITICAL: Check if the element exists before setting textContent!
    const elements = {
        name: document.getElementById('display-name'),
        client: document.getElementById('display-client'),
        location: document.getElementById('display-location'),
        startDate: document.getElementById('display-start-date'),
        deadline: document.getElementById('display-deadline'),
        value: document.getElementById('display-value'),
        type: document.getElementById('display-type'),
    };
    
    if (elements.name) elements.name.textContent = project.ProjectName || 'N/A';
    if (elements.client) elements.client.textContent = project.ClientName || 'N/A';
    if (elements.location) elements.location.textContent = project.ProjectLocation || 'N/A';
    if (elements.startDate) elements.startDate.textContent = project.ProjectStartDate || 'N/A';
    if (elements.deadline) elements.deadline.textContent = project.ProjectDeadline || 'N/A';
    if (elements.value) elements.value.textContent = `INR ${parseFloat(project.ProjectValue || 0).toLocaleString('en-IN')}`;
    if (elements.type) elements.type.textContent = project.ProjectType || 'N/A';
}

// --- PROJECT ADDITION LOGIC (As requested by "not able to add projects") ---
const addProjectBtn = document.getElementById('addProjectBtn');

if (addProjectBtn) {
    // Note: You must add a modal or form in your HTML to actually collect the new project data
    addProjectBtn.addEventListener('click', () => {
        // For simplicity, we'll just log an action. 
        // In a real app, this would open a modal form.
        showMessageBox("Function to add new project would open here.", 'info');
    });
}


// --- INITIALIZATION ---
window.onload = loadProjects;
