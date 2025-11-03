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

// Global variable to temporarily hold the ID of the project just created
let projectIDToSelect = null; 

async function loadProjects() {
    const result = await sendDataToSheet('Projects', 'GET');

    if (result.status === 'success' && Array.isArray(result.data)) {
        allProjects = result.data;
        projectSelector.innerHTML = '<option value="">-- Select Project --</option>';

        // 1. Sort projects by ID descending (assuming higher ID = newer project)
        allProjects.sort((a, b) => b.ProjectID - a.ProjectID);
        
        // Determine which ID to select: use the newly created ID, otherwise use the current ID, otherwise the newest one.
        const targetID = projectIDToSelect || currentProjectID || (allProjects.length > 0 ? allProjects[0].ProjectID : null);

        allProjects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.ProjectID;
            option.textContent = project.ProjectName;
            projectSelector.appendChild(option);
        });

        if (targetID) {
            currentProjectID = targetID;
            projectSelector.value = currentProjectID;
        } else {
            currentProjectID = null;
            currentProjectName.textContent = 'Select a Project';
        }
        
        projectIDToSelect = null; // Clear the temporary ID
        
        if (currentProjectID) {
            await loadDashboardData();
        }

    } else {
        console.error("Failed to load projects:", result.message);
        currentProjectName.textContent = 'ERROR: Cannot load projects.';
    }
}

// You also need to modify the newProjectForm submission handler:
if (newProjectForm) {
    newProjectForm.addEventListener('submit', async (e) => {
        // ... (existing code to get newProjectData)
        
        // Send POST request...
        const result = await sendDataToSheet('Projects', 'POST', newProjectData);

        if (result.status === 'success') {
            showMessageBox(`Project "${newProjectData.ProjectName}" created successfully!`, 'success');
            newProjectForm.reset();
            newProjectModal.style.display = 'none';
            
            // Set the global variable BEFORE reloading
            projectIDToSelect = newProjectData.ProjectID; 
            
            await loadProjects(); // Reload the project list
        } else {
           // ...
        }
    });
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
// --- PROJECT ADDITION LOGIC (Restore Modal Functionality) ---

const newProjectModal = document.getElementById('newProjectModal');
const addProjectBtn = document.getElementById('addProjectBtn');
const closeButton = newProjectModal ? newProjectModal.querySelector('.close-button') : null;
const newProjectForm = document.getElementById('newProjectForm');

// 1. Show/Hide Modal Logic
if (addProjectBtn && newProjectModal && closeButton) {
    // Show modal
    addProjectBtn.addEventListener('click', () => {
        newProjectModal.style.display = 'block';
    });

    // Hide modal via 'x' button
    closeButton.addEventListener('click', () => {
        newProjectModal.style.display = 'none';
    });

    // Hide modal when clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target == newProjectModal) {
            newProjectModal.style.display = 'none';
        }
    });
}


// 2. Form Submission (POST Request)
if (newProjectForm) {
    newProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newProjectData = {
            ProjectID: document.getElementById('newProjectID').value,
            ProjectName: document.getElementById('newProjectName').value,
            ClientName: document.getElementById('newClientName').value,
            ProjectLocation: document.getElementById('newProjectLocation').value,
            ProjectStartDate: document.getElementById('newProjectStartDate').value,
            ProjectDeadline: document.getElementById('newProjectDeadline').value,
            ProjectValue: parseFloat(document.getElementById('newProjectValue').value),
            ProjectType: document.getElementById('newProjectType').value,
        };

        // Send POST request to the 'Projects' sheet
        const result = await sendDataToSheet('Projects', 'POST', newProjectData);

        if (result.status === 'success') {
            showMessageBox(`Project "${newProjectData.ProjectName}" created successfully!`, 'success');
            newProjectForm.reset();
            newProjectModal.style.display = 'none';
            await loadProjects(); // Reload the project list and dashboard
        } else {
            showMessageBox(`Failed to create project: ${result.message}`, 'error');
        }
    });
}


// --- INITIALIZATION ---
window.onload = loadProjects;


