// =============================================================================
// script.js: FINAL ROBUST & ERROR-FREE OPERATIONAL VERSION
// =============================================================================

// 🎯 CRITICAL: USING THE LOCAL PROXY PATH (/api)
const SHEET_API_URL = "/api"; 

// --- CRITICAL GLOBAL VARIABLE DECLARATIONS (MUST BE AT THE VERY TOP) ---
let currentProjectID = null; 
let allProjects = [];
let projectIDToSelect = null; // Used to select the new project after creation

// DOM Element References (All must be defined here to prevent ReferenceErrors)
const projectSelector = document.getElementById('projectSelector');
const currentProjectName = document.getElementById('currentProjectName');

// New Project Modal Elements
const newProjectModal = document.getElementById('newProjectModal');
const addProjectBtn = document.getElementById('addProjectBtn');
const newProjectForm = document.getElementById('newProjectForm');
const closeNewProjectBtn = newProjectModal ? newProjectModal.querySelector('.close-button') : null; 

// Edit Project Modal Elements
const editProjectDetailsBtn = document.getElementById('editProjectDetailsBtn');
const projectEditModal = document.getElementById('projectEditModal');
const projectEditForm = document.getElementById('projectEditForm');
const cancelEditBtn = document.getElementById('cancelEditBtn');


// --- DUMMY FUNCTION for error/success messages (Required for error-free execution) ---
function showMessageBox(message, type) {
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
    // You can replace this with an alert(message) or a simple UI element
}

// --- 1. THE HI TEK 23-STEP WORKFLOW LIST (KEEP FOR POTENTIAL CLIENT-SIDE USE) ---
const HI_TEK_TASKS_MAP = [
    { Name: '1. Understanding the System', Responsible: 'Project Manager' },
    // ... (Your 23 tasks array content)
];


// --- 2. UTILITY: API Communication ---

async function sendDataToSheet(sheetName, method, data = {}) {
    let payload = { sheetName, method, ...data };

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
        console.error(`API Error on ${method} ${sheetName}:`, error);
        return { status: 'error', message: error.message };
    }
}


// --- 3. PROJECT & UI MANAGEMENT ---

async function loadProjects() {
    const result = await sendDataToSheet('Projects', 'GET');

    if (result.status === 'success' && Array.isArray(result.data)) {
        allProjects = result.data;
        projectSelector.innerHTML = '<option value="">-- Select Project --</option>';
        
        // Use a temporary ID if a new project was just created, otherwise stick to current
        let targetID = projectIDToSelect || currentProjectID;
        
        if (!targetID && allProjects.length > 0) {
            // Default to the first project if nothing is selected
            targetID = allProjects[0].ProjectID; 
        }

        allProjects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.ProjectID;
            // Use the ProjectName property (remapped in Apps Script)
            option.textContent = project.ProjectName || project.Name || 'Unnamed Project'; 
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
        } else {
            // Clear all panels if no project is selected
            currentProjectName.textContent = 'Select a Project';
            renderProjectDetails(null);
            renderTaskList([]); // Clear tasks
            // (You would add logic to clear other panels here)
        }

    } else {
        console.error("Failed to load projects:", result.message);
        currentProjectName.textContent = 'ERROR: Cannot load projects.';
        // If the fetch fails completely, show an error and clear everything
        renderProjectDetails(null); 
        renderTaskList([]);
    }
}

// Initial listener
if (projectSelector) {
    projectSelector.addEventListener('change', async (e) => {
        currentProjectID = e.target.value;
        if (currentProjectID) {
            await loadDashboardData();
        } else {
            // Handle 'Select Project' option being chosen
            loadProjects(); 
        }
    });
}

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
        currentProjectName.textContent = project.ProjectName || project.Name || 'Project Details';
        renderProjectDetails(project);
        renderTaskList(tasks); 
    } else {
        currentProjectName.textContent = 'Project Not Found';
        renderProjectDetails(null);
        renderTaskList([]);
    }
}


// --- 4. RENDERING FUNCTIONS (MINIMAL, SAFE VERSION) ---

function renderProjectDetails(project) {
    const displayDiv = document.getElementById('projectDetailsDisplay') || document.querySelector('.panel:nth-child(1) .content');
    if (!displayDiv) return;

    if (!project) {
        displayDiv.innerHTML = '<p>Project Details: N/A</p>';
        return;
    }

    // Safely update DOM elements
    const updateElement = (id, content) => {
        const el = document.getElementById(id);
        if (el) el.textContent = content;
    };

    updateElement('display-name', project.ProjectName || project.Name || 'N/A');
    updateElement('display-client', project.ClientName || 'N/A');
    updateElement('display-location', project.ProjectLocation || 'N/A');
    updateElement('display-start-date', project.ProjectStartDate || 'N/A');
    updateElement('display-deadline', project.ProjectDeadline || 'N/A');
    // Assuming you have Budget as a key in the sheet
    updateElement('display-value', `INR ${parseFloat(project.Budget || project.ProjectValue || 0).toLocaleString('en-IN')}`);
    updateElement('display-type', project.ProjectType || 'N/A');
    
    // Ensure all KPIs are reset/updated too
    updateElement('kpi-days-spent', 'N/A'); 
    updateElement('kpi-days-left', 'N/A');
    updateElement('kpi-project-value', `₹ N/A`);
    updateElement('kpi-cost-to-complete', `₹ N/A`);
}

function renderTaskList(tasks) {
    const taskContainer = document.getElementById('taskList') || document.getElementById('taskTableBody');
    if (!taskContainer) return;
    
    taskContainer.innerHTML = '';
    
    if (tasks.length === 0) {
        // Use a list item for general visibility in a list or table for general content
        const placeholderRow = document.createElement('li');
        placeholderRow.className = 'placeholder';
        placeholderRow.textContent = 'No tasks loaded for this project.';
        taskContainer.appendChild(placeholderRow);
        return;
    }

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.textContent = `${task.TaskName} - Responsible: ${task.Responsible} - Status: ${task.Status}`;
        taskContainer.appendChild(li);
    });
}


// --- 5. PROJECT ADDITION LOGIC (Modal Show/Hide) ---

if (addProjectBtn && newProjectModal && closeNewProjectBtn) {
    addProjectBtn.addEventListener('click', () => {
        newProjectModal.style.display = 'block';
    });

    closeNewProjectBtn.addEventListener('click', () => {
        newProjectModal.style.display = 'none';
    });

    window.addEventListener('click', (event) => {
        if (event.target == newProjectModal) {
            newProjectModal.style.display = 'none';
        }
    });
}


// --- 6. PROJECT ADDITION FORM SUBMISSION (POST Request) ---

if (newProjectForm) {
    newProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newProjectData = {
            ProjectID: document.getElementById('newProjectID').value,
            ProjectName: document.getElementById('newProjectName').value,
            // The Apps Script expects ProjectName here, but POST to the sheet
            // maps it to the 'Name' column. This is correct.
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

// --- 7. EDIT PROJECT LOGIC (Modal Show/Hide) ---

if (editProjectDetailsBtn && projectEditModal) {
    editProjectDetailsBtn.addEventListener('click', () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to edit.', 'warning');
            return;
        }
        
        // Find the project data (simplified find for demonstration)
        const project = allProjects.find(p => p.ProjectID === currentProjectID) || {};
        
        // Populate the form (Ensure your index.html has elements with these IDs)
        document.getElementById('editProjectID').value = project.ProjectID || '';
        document.getElementById('editProjectName').value = project.ProjectName || project.Name || '';
        document.getElementById('editClientName').value = project.ClientName || '';
        document.getElementById('editProjectLocation').value = project.ProjectLocation || '';
        document.getElementById('editProjectStartDate').value = project.ProjectStartDate || '';
        document.getElementById('editProjectDeadline').value = project.ProjectDeadline || '';
        document.getElementById('editProjectValue').value = project.ProjectValue || project.Budget || 0;
        document.getElementById('editProjectType').value = project.ProjectType || '';
        
        projectEditModal.style.display = 'block';
    });
    
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            projectEditModal.style.display = 'none';
        });
    }
}


// --- 8. EDIT FORM SUBMISSION (PUT Request) ---

if (projectEditForm) {
    projectEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get updated data from the form
        const updatedData = {
            ProjectID: document.getElementById('editProjectID').value,
            ProjectName: document.getElementById('editProjectName').value,
            ClientName: document.getElementById('editClientName').value,
            ProjectLocation: document.getElementById('editProjectLocation').value,
            ProjectStartDate: document.getElementById('editProjectStartDate').value,
            ProjectDeadline: document.getElementById('editProjectDeadline').value,
            ProjectValue: parseFloat(document.getElementById('editProjectValue').value),
            ProjectType: document.getElementById('editProjectType').value,
        };

        const result = await sendDataToSheet('Projects', 'PUT', updatedData);

        if (result.status === 'success') {
            projectEditModal.style.display = 'none';
            await loadProjects(); // Reload projects and dashboard
            showMessageBox(`Project ${updatedData.ProjectName} updated successfully!`, 'success');
        } else {
            showMessageBox(`Failed to update project: ${result.message}`, 'error');
        }
    });
}


// --- 9. INITIALIZATION (Must be the last line) ---
window.onload = loadProjects;
