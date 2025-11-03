// =============================================================================
// script.js: SIMPLE DATA FETCH & DISPLAY VERSION
// =============================================================================

const SHEET_API_URL = "/api"; 
let currentProjectID = null; 
let allProjects = [];

// --- UTILITY (CRITICAL API FIX) ---
async function sendDataToSheet(sheetName, method, data = {}) {
    let payload = { sheetName, method, ...data }; // Merge everything at the top level

    try {
        const response = await fetch(SHEET_API_URL, {
            method: 'POST', // Always POST for Apps Script
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error(`HTTP error! Status: ${response.status}`);
            return { status: 'error', message: `HTTP Error ${response.status}` };
        }

        return await response.json();

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
    const project = (projectResult.status === 'success' && projectResult.data) ? projectResult.data : null;
    
    // 2. Get Tasks
    const taskResult = await sendDataToSheet('Tasks', 'GET', { ProjectID: currentProjectID });
    const tasks = (taskResult.status === 'success' && Array.isArray(taskResult.data)) ? taskResult.data : [];
    
    // 3. Render Data
    if (project) {
        currentProjectName.textContent = project.ProjectName;
        renderProjectDetails(project);
        renderTaskList(tasks);
        // You would add other rendering functions here (KPIs, Expenses, etc.)
        // For simplicity, we only include the core two:
    }
}

// --- RENDERING FUNCTIONS (Matching your HTML) ---

function renderProjectDetails(project) {
    document.getElementById('display-name').textContent = project.ProjectName || 'N/A';
    document.getElementById('display-client').textContent = project.ClientName || 'N/A';
    document.getElementById('display-location').textContent = project.ProjectLocation || 'N/A';
    document.getElementById('display-start-date').textContent = project.ProjectStartDate || 'N/A';
    document.getElementById('display-deadline').textContent = project.ProjectDeadline || 'N/A';
    document.getElementById('display-value').textContent = `INR ${parseFloat(project.ProjectValue || 0).toLocaleString('en-IN')}`;
    document.getElementById('display-type').textContent = project.ProjectType || 'N/A';
    
    // Hide the edit form by default if it exists
    const editForm = document.getElementById('projectDetailsEdit');
    const displayDiv = document.getElementById('projectDetailsDisplay');
    if (editForm) editForm.style.display = 'none';
    if (displayDiv) displayDiv.style.display = 'block';
}


function renderTaskList(tasks) {
    const taskList = document.getElementById('taskList'); // Assuming taskList is your UL/container
    
    // IMPORTANT: If you use the new HTML (with the TABLE) this ID is wrong.
    // If you're using the old HTML (with the UL), this ID is correct.
    // Let's assume you're using the simpler UL structure for now.

    if (!taskList) {
        console.error("Task list container (#taskList) not found in HTML.");
        return;
    }
    
    taskList.innerHTML = '';

    if (tasks.length === 0) {
        taskList.innerHTML = '<li class="placeholder">No tasks loaded for this project.</li>';
        return;
    }
    
    tasks.forEach(task => {
        const li = document.createElement('li');
        const status = task.Status === 'Completed' ? '✅' : '⏳';
        li.innerHTML = `${status} ${task.TaskName} (Due: ${task.DueDate || 'N/A'})`;
        taskList.appendChild(li);
    });
}


// --- INITIALIZATION ---
window.onload = loadProjects;
