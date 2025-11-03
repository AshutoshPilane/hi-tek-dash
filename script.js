// =============================================================================
// script.js: FINAL ROBUST & ERROR-FREE OPERATIONAL VERSION
// =============================================================================

const SHEET_API_URL = "/api"; 

// --- CRITICAL GLOBAL VARIABLE DECLARATIONS (MUST BE AT THE TOP) ---
let currentProjectID = null; 
let allProjects = [];
let projectIDToSelect = null; // Used to select the new project after creation

// DOM Element References
const projectSelector = document.getElementById('projectSelector');
const currentProjectName = document.getElementById('currentProjectName');
const newProjectModal = document.getElementById('newProjectModal');
const addProjectBtn = document.getElementById('addProjectBtn');
const newProjectForm = document.getElementById('newProjectForm');
const closeButton = newProjectModal ? newProjectModal.querySelector('.close-button') : null; 


// --- UTILITY (API Compatibility & Messaging) ---

function showMessageBox(message, type) {
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
    // Optional: alert(message);
}

async function sendDataToSheet(sheetName, method, data = {}) {
    let payload = { sheetName, method, ...data }; // Merge data at top level

    try {
        const response = await fetch(SHEET_API_URL, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        
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

async function loadProjects() {
    const result = await sendDataToSheet('Projects', 'GET');

    if (result.status === 'success' && Array.isArray(result.data)) {
        allProjects = result.data;
        projectSelector.innerHTML = '<option value="">-- Select Project --</option>';

        // 1. Sort projects by ID (or name) if needed, but we'll use a direct target ID.
        
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
    
    // 2. Get Tasks (Example)
    const taskResult = await sendDataToSheet('Tasks', 'GET', { ProjectID: currentProjectID });
    const tasks = (taskResult.status === 'success' && Array.isArray(taskResult.data)) ? taskResult.data : [];
    
    // 3. Render Data
    if (project) {
        currentProjectName.textContent = project.ProjectName;
        renderProjectDetails(project);
        renderTaskList(tasks); // Ensure this function is defined if you need tasks to display
    } else {
        currentProjectName.textContent = 'Project Not Found';
        renderProjectDetails(null);
    }
}


// --- RENDERING FUNCTIONS (WITH CRITICAL NULL CHECKS) ---

function renderProjectDetails(project) {
    if (!project) {
        const displayDiv = document.getElementById('projectDetailsDisplay');
        if (displayDiv) displayDiv.innerHTML = '<p>No details available.</p>';
        return;
    }

    // Safely update DOM elements (the element check prevents the crash)
    const updateElement = (id, content) => {
        const el = document.getElementById(id);
        if (el) el.textContent = content;
    };

    updateElement('display-name', project.ProjectName || 'N/A');
    updateElement('display-client', project.ClientName || 'N/A');
    updateElement('display-location', project.ProjectLocation || 'N/A');
    updateElement('display-start-date', project.ProjectStartDate || 'N/A');
    updateElement('display-deadline', project.ProjectDeadline || 'N/A');
    updateElement('display-value', `INR ${parseFloat(project.ProjectValue || 0).toLocaleString('en-IN')}`);
    updateElement('display-type', project.ProjectType || 'N/A');
}

function renderTaskList(tasks) {
    // This is a placeholder. You need to implement this to match your HTML structure.
    const taskContainer = document.getElementById('taskList') || document.getElementById('taskTableBody');
    if (!taskContainer) return;
    
    taskContainer.innerHTML = '';
    
    if (tasks.length === 0) {
        taskContainer.innerHTML = '<li class="placeholder">No tasks loaded for this project.</li>';
        return;
    }
    // ... (Your actual task rendering logic goes here)
}


// --- PROJECT ADDITION LOGIC ---

// 2. Show/Hide Modal Logic
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


// 3. Form Submission (POST Request)
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
        
        if (!newProjectData.ProjectID || !newProjectData.ProjectName) {
            showMessageBox('Project ID and Name are required.', 'error');
            return;
        }

        const result = await sendDataToSheet('Projects', 'POST', newProjectData);

        if (result.status === 'success') {
            showMessageBox(`Project "${newProjectData.ProjectName}" created successfully!`, 'success');
            newProjectForm.reset();
            newProjectModal.style.display = 'none';
            
            projectIDToSelect = newProjectData.ProjectID; 
            
            await loadProjects();
        } else {
            showMessageBox(`Failed to create project: ${result.message}`, 'error');
        }
    });
}


// --- INITIALIZATION ---
window.onload = loadProjects;
