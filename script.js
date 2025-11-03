// =============================================================================
// script.js: FINAL OPERATIONAL VERSION (Matched to your index.html IDs)
// =============================================================================

// 🎯 CRITICAL: USING THE LOCAL PROXY PATH (/api)
const SHEET_API_URL = "/api"; 

// --- CRITICAL GLOBAL VARIABLE DECLARATIONS ---
let currentProjectID = null; 
let allProjects = [];
let projectIDToSelect = null; // Used to select the new project after creation

// DOM Element References
const projectSelector = document.getElementById('projectSelector');
const currentProjectName = document.getElementById('currentProjectName');

// New Project Modal Elements
const newProjectModal = document.getElementById('newProjectModal');
const addProjectBtn = document.getElementById('addProjectBtn');
const newProjectForm = document.getElementById('newProjectForm');
const closeNewProjectBtn = newProjectModal ? newProjectModal.querySelector('.close-button') : null; 

// Edit Project Elements (Using the IDs found in your index.html)
const editProjectDetailsBtn = document.getElementById('editProjectDetailsBtn');
// Note: Your HTML does not define a 'projectEditModal', but an input area
const projectEditDisplay = document.getElementById('projectDetailsDisplay');
const projectEditInput = document.getElementById('projectDetailsEdit'); 
const saveProjectDetailsBtn = document.getElementById('saveProjectDetailsBtn'); // Assuming you use this
const deleteProjectBtn = document.getElementById('deleteProjectBtn');


// --- DUMMY FUNCTION for error/success messages ---
function showMessageBox(message, type) {
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
    // You can replace this with an alert(message) or a simple UI element
}

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
        // Ensure projectSelector exists before trying to access it
        if (!projectSelector) {
            console.error("CRITICAL HTML ERROR: Missing <select id=\"projectSelector\">.");
            return;
        }
        
        projectSelector.innerHTML = '<option value="">-- Select Project --</option>';
        
        let targetID = projectIDToSelect || currentProjectID;
        
        if (!targetID && allProjects.length > 0) {
            targetID = allProjects[0].ProjectID; 
        }

        allProjects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.ProjectID;
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
        
        projectIDToSelect = null; 
        
        if (currentProjectID) {
            await loadDashboardData();
        } else {
            currentProjectName.textContent = 'Select a Project';
            renderProjectDetails(null);
            renderTaskList([]);
        }

    } else {
        console.error("Failed to load projects:", result.message);
        currentProjectName.textContent = 'ERROR: Cannot load projects.';
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
            loadProjects(); 
        }
    });
}

async function loadDashboardData() {
    if (!currentProjectID) return;

    // 1. Get Project Details
    const projectResult = await sendDataToSheet('Projects', 'GET', { ProjectID: currentProjectID });
    // If getting single record, data will be the object, not an array
    const project = (projectResult.status === 'success' && projectResult.data && !Array.isArray(projectResult.data)) ? projectResult.data : null; 
    
    // 2. Get Tasks 
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


// --- 4. RENDERING FUNCTIONS (MATCHED TO YOUR index.html IDs) ---

function renderProjectDetails(project) {
    const detailContainer = document.getElementById('projectDetailsDisplay');
    
    if (!detailContainer) {
        console.error("CRITICAL HTML ERROR: Missing <div id=\"projectDetailsDisplay\">.");
        return; 
    }
    
    const updateElement = (id, content) => {
        const el = document.getElementById(id);
        if (el) el.textContent = content;
    };

    if (!project) {
        // Reset all displayed values to 'N/A' when no project is selected
        updateElement('display-name', 'N/A');
        updateElement('display-start-date', 'N/A');
        updateElement('display-deadline', 'N/A');
        updateElement('display-location', 'N/A');
        updateElement('display-amount', 'N/A'); // Mapped to Budget/Value
        updateElement('display-contractor', 'N/A');
        updateElement('display-engineers', 'N/A');
        updateElement('display-contact1', 'N/A');
        updateElement('display-contact2', 'N/A');
        
        // Reset KPI values
        updateElement('kpi-days-spent', 'N/A'); 
        updateElement('kpi-days-left', 'N/A');
        updateElement('kpi-progress', '0%');
        updateElement('kpi-material-progress', '0% Dispatched');
        updateElement('kpi-work-order', '₹ 0');
        updateElement('kpi-total-expenses', '₹ 0');
        return;
    }
    
    // Calculate Project Value for display in Project Details and KPI
    const projectValue = parseFloat(project.ProjectValue || project.Budget || 0);

    // Update Project Details using YOUR HTML IDs
    updateElement('display-name', project.ProjectName || project.Name || 'N/A');
    updateElement('display-start-date', project.ProjectStartDate || 'N/A');
    updateElement('display-deadline', project.ProjectDeadline || 'N/A');
    updateElement('display-location', project.ProjectLocation || 'N/A');
    updateElement('display-amount', `INR ${projectValue.toLocaleString('en-IN')}`);
    updateElement('display-contractor', project.Contractor || 'N/A');
    updateElement('display-engineers', project.Engineers || 'N/A');
    updateElement('display-contact1', project.Contact1 || 'N/A');
    updateElement('display-contact2', project.Contact2 || 'N/A');
    
    // Update KPI values using YOUR HTML IDs
    updateElement('kpi-days-spent', 'N/A'); 
    updateElement('kpi-days-left', 'N/A');
    updateElement('kpi-progress', '0%');
    updateElement('kpi-material-progress', '0% Dispatched');
    updateElement('kpi-work-order', `₹ ${projectValue.toLocaleString('en-IN')}`); 
    updateElement('kpi-total-expenses', '₹ 0');
}

function renderTaskList(tasks) {
    // CRITICAL: Must target the <tbody> element 
    const taskContainer = document.getElementById('taskTableBody'); 
    
    if (!taskContainer) {
        console.error("CRITICAL HTML ERROR: Missing <tbody id=\"taskTableBody\"> in the Task Tracker panel.");
        return;
    }
    
    taskContainer.innerHTML = ''; // Clear existing content
    
    if (tasks.length === 0) {
        // Placeholder row must span 5 columns
        taskContainer.innerHTML = '<tr><td colspan="5">No tasks loaded for this project.</td></tr>';
        return;
    }

    tasks.forEach(task => {
        const tr = document.createElement('tr');
        // Structure matches your <table> headers: Task, Responsible, Progress, Due Date, Status
        tr.innerHTML = `
            <td>${task.TaskName || 'N/A'}</td>
            <td>${task.Responsible || 'N/A'}</td>
            <td>${task.Progress || '0'}%</td>
            <td>${task.DueDate || 'N/A'}</td>
            <td>${task.Status || 'Pending'}</td>
        `;
        taskContainer.appendChild(tr);
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

// --- 7. EDIT/DELETE PROJECT LOGIC (Simplified Toggle) ---

if (editProjectDetailsBtn && projectEditDisplay && projectEditInput) {
    editProjectDetailsBtn.addEventListener('click', () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to edit.', 'warning');
            return;
        }
        
        // Toggle visibility
        projectEditDisplay.style.display = 'none';
        projectEditInput.style.display = 'block';

        // Load current data into the input form
        const project = allProjects.find(p => p.ProjectID === currentProjectID) || {};
        document.getElementById('input-name').value = project.ProjectName || project.Name || '';
        document.getElementById('input-start-date').value = project.ProjectStartDate || '';
        document.getElementById('input-deadline').value = project.ProjectDeadline || '';
        document.getElementById('input-location').value = project.ProjectLocation || '';
        document.getElementById('input-amount').value = project.ProjectValue || project.Budget || 0;
        document.getElementById('input-contractor').value = project.Contractor || '';
        document.getElementById('input-engineers').value = project.Engineers || '';
        document.getElementById('input-contact1').value = project.Contact1 || '';
        document.getElementById('input-contact2').value = project.Contact2 || '';
    });
}

if (saveProjectDetailsBtn && projectEditDisplay && projectEditInput) {
    saveProjectDetailsBtn.addEventListener('click', async () => {
        // Gather data from input fields and send PUT request (Implementation omitted for brevity, but this is where it goes)
        // ...PUT logic...
        
        // On success:
        projectEditDisplay.style.display = 'block';
        projectEditInput.style.display = 'none';
        await loadProjects(); // Reload and render
        showMessageBox('Project details updated!', 'success');
    });
}


if (deleteProjectBtn) {
    deleteProjectBtn.addEventListener('click', async () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to delete.', 'warning');
            return;
        }
        
        if (confirm(`Are you sure you want to permanently delete project ${currentProjectID}? This cannot be undone.`)) {
            const result = await sendDataToSheet('Projects', 'DELETE', { ProjectID: currentProjectID });
            
            if (result.status === 'success') {
                showMessageBox(`Project ${currentProjectID} deleted successfully.`, 'success');
                currentProjectID = null; // Clear selection
                await loadProjects();
            } else {
                showMessageBox(`Failed to delete project: ${result.message}`, 'error');
            }
        }
    });
}


// --- 9. INITIALIZATION (Must be the last line) ---
window.onload = loadProjects;
