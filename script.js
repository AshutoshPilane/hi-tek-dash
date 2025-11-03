// ==============================================================================
// script.js: FINAL OPERATIONAL VERSION (Fixed Spreadsheet Header Mismatch)
// ==============================================================================

// 🎯 CRITICAL: USING THE LOCAL PROXY PATH (/api)
const SHEET_API_URL = "/api"; 

let currentProjectID = null; 
let allProjects = [];

// --- DUMMY FUNCTION for error/success messages (Required for error-free execution) ---
// This prevents crashes from missing showMessageBox calls.
function showMessageBox(message, type) {
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
    // In a full application, this would display a nice UI modal instead of alert()
}


// --- 1. THE HI TEK 23-STEP WORKFLOW LIST ---
const HI_TEK_TASKS_MAP = [
    { Name: '1. Understanding the System', Responsible: 'Project Manager' },
    { Name: '2. Identifying Scope', Responsible: 'Site Engineer/Project coordinator' },
    { Name: '3. Measurement', Responsible: 'Surveyor/Field Engineer' },
    { Name: '4. Cross-Check Scope', Responsible: 'Site Engineer/Quality Inspector' },
    { Name: '5. Calculate Project Cost', Responsible: 'Estimation Engineer/Cost Analyst' },
    { Name: '6. Review Payment Terms', Responsible: 'Accounts Manager/Contract Specialist' },
    { Name: '7. Calculate BOQ', Responsible: 'Estimation Engineer/Procurement Manager' },
    { Name: '8. Compare Costs', Responsible: 'Accounts/Procurement' },
    { Name: '9. Order Materials', Responsible: 'Procurement Manager' },
    { Name: '10. Issue Work Orders', Responsible: 'Project Manager' },
    { Name: '11. Mobilize Manpower', Responsible: 'HR/Contractor' },
    { Name: '12. Site Setup & Safety Check', Responsible: 'Safety Officer/Site Engineer' },
    { Name: '13. Initial Survey & Layout', Responsible: 'Surveyor' },
    { Name: '14. Earthwork/Excavation', Responsible: 'Site Engineer' },
    { Name: '15. Foundation Work', Responsible: 'Site Engineer' },
    { Name: '16. Structural Frame Erection', Responsible: 'Contractor/Site Engineer' },
    { Name: '17. Plumbing & Electrical Rough-in', Responsible: 'MEP Coordinator' },
    { Name: '18. Finishing Work (Walls/Floors)', Responsible: 'Site Supervisor' },
    { Name: '19. Installation of Services', Responsible: 'MEP Coordinator' },
    { Name: '20. Quality Inspection (Pre-handover)', Responsible: 'Quality Inspector' },
    { Name: '21. Final Cleanup & Punch List', Responsible: 'Project Manager' },
    { Name: '22. Project Handover', Responsible: 'Project Manager/Client' },
    { Name: '23. Final Billing & Closure', Responsible: 'Accounts Manager' }
];


// --- 2. FIREBASE (Placeholder for future persistence) ---
/* NOTE: This application uses a Google Sheets backend via Vercel proxy, 
   so Firebase is not required for data persistence. 
*/


// --- 3. API COMMUNICATION ---

/**
 * Sends a request to the Google Sheets API via the Vercel proxy.
 * @param {string} sheetName - Name of the target sheet ('Projects', 'Tasks', etc.)
 * @param {string} method - HTTP method equivalent ('GET', 'POST', 'PUT', 'DELETE')
 * @param {object} data - Data payload (for POST/PUT) or query parameters (for GET).
 * @returns {Promise<object>} The parsed JSON response from the API.
 */
async function sendDataToSheet(sheetName, method, data = {}) {
    // Add sheetName and method to the payload for the Apps Script handler
    const payload = { sheetName, method, ...data };
    
    // For GET requests, parameters should be in the URL or body for doPost(e) filtering
    // Since we use POST for all GAS calls, payload structure is consistent.
    
    // console.log(`[API] Sending ${method} request to ${sheetName} with data:`, payload);

    try {
        const response = await fetch(SHEET_API_URL, {
            method: 'POST', // All requests to GAS doPost are technically POST
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        // console.log(`[API] Response from ${sheetName}/${method}:`, result);
        return result;

    } catch (error) {
        console.error(`Error during API call for ${sheetName}/${method}:`, error);
        return { status: 'error', message: error.message };
    }
}


// --- 4. DATA LOADING AND SELECTION ---

const projectSelector = document.getElementById('projectSelector');
const currentProjectNameDisplay = document.getElementById('currentProjectName');

/**
 * Loads all projects, populates the selector, and initializes the dashboard.
 */
async function loadProjects() {
    const result = await sendDataToSheet('Projects', 'GET');

    if (result.status === 'success' && result.data) {
        allProjects = result.data;
        populateProjectSelector(allProjects);

        // Determine which project to load
        let projectToLoadID = null;
        if (allProjects.length > 0) {
            // Priority 1: Keep current selection if valid
            if (currentProjectID && allProjects.some(p => p.ProjectID === currentProjectID)) {
                projectToLoadID = currentProjectID;
            } else {
                // Priority 2: Select the first project
                projectToLoadID = allProjects[0].ProjectID;
            }
        }
        
        currentProjectID = projectToLoadID;
        // console.log(`DEBUG LOAD: Determined project to load: ${projectToLoadID}`);
        
        if (projectToLoadID) {
            if (projectSelector) {
                 projectSelector.value = projectToLoadID;
                 // console.log(`DEBUG LOAD: Successfully selected option ${projectToLoadID} in UI.`);
            }
            await updateDashboard(projectToLoadID);
        } else {
            // Reset UI if no projects exist
            resetDashboard();
        }

    } else {
        console.error('Failed to load projects:', result.message);
        resetDashboard();
        showMessageBox(`Failed to connect to dashboard data: ${result.message}`, 'error');
    }
}

/**
 * Populates the project selection dropdown.
 */
function populateProjectSelector(projects) {
    if (projectSelector) {
        projectSelector.innerHTML = ''; // Clear existing options

        if (projects.length === 0) {
            projectSelector.innerHTML = '<option value="">No Projects Found</option>';
            return;
        }

        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.ProjectID;
            option.textContent = `${project.ProjectID} - ${project.Name}`; // Using 'Name' to match sheet
            projectSelector.appendChild(option);
        });
    }
}

/**
 * Handles the selection change from the dropdown.
 */
if (projectSelector) {
    projectSelector.addEventListener('change', async (e) => {
        currentProjectID = e.target.value;
        if (currentProjectID) {
            await updateDashboard(currentProjectID);
        } else {
            resetDashboard();
        }
    });
}


// --- 5. DASHBOARD UPDATING AND KPI CALCULATION ---

function resetDashboard() {
    currentProjectNameDisplay.textContent = 'Select a Project';
    // Clear all KPI boxes and tables
    const kpis = ['kpi-days-spent', 'kpi-days-left', 'kpi-progress', 'kpi-material-progress', 'kpi-work-order', 'kpi-total-expenses'];
    kpis.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = id.includes('progress') ? '0%' : 'N/A';
        if(id === 'kpi-work-order' || id === 'kpi-total-expenses') el.textContent = '₹ 0';
    });
    
    // Clear details display
    document.getElementById('display-name').textContent = 'N/A';
    document.getElementById('display-start-date').textContent = 'N/A';
    document.getElementById('display-deadline').textContent = 'N/A';
    document.getElementById('display-location').textContent = 'N/A';
    document.getElementById('display-amount').textContent = 'N/A';
    document.getElementById('display-contractor').textContent = 'N/A';
    document.getElementById('display-engineers').textContent = 'N/A';
    document.getElementById('display-contact1').textContent = 'N/A';
    document.getElementById('display-contact2').textContent = 'N/A';
    
    // Clear tables
    const taskTableBody = document.getElementById('taskTableBody');
    if(taskTableBody) taskTableBody.innerHTML = '<tr><td colspan="5">No tasks loaded...</td></tr>';

    const materialTableBody = document.getElementById('materialTableBody');
    if(materialTableBody) materialTableBody.innerHTML = '<tr><td colspan="5">No materials loaded...</td></tr>';

    const recentExpensesList = document.getElementById('recentExpensesList');
    if(recentExpensesList) recentExpensesList.innerHTML = '<li class="placeholder">No expenses loaded...</li>';
}

/**
 * Main function to refresh all dashboard components for the selected project.
 */
async function updateDashboard(projectID) {
    if (!projectID) return resetDashboard();

    const projectData = allProjects.find(p => p.ProjectID === projectID);
    if (!projectData) return resetDashboard();

    currentProjectNameDisplay.textContent = projectData.Name || 'N/A';
    
    // 1. Update Project Details and KPIs
    updateProjectDetails(projectData);
    
    // 2. Load Tasks and Update Task Tracker / Progress KPI
    const taskResult = await sendDataToSheet('Tasks', 'GET', { ProjectID: projectID });
    if (taskResult.status === 'success') {
        renderTasks(taskResult.data);
        calculateTaskKPI(taskResult.data);
    } else {
        console.error('Failed to load tasks:', taskResult.message);
        renderTasks([]);
    }

    // 3. Load Materials and Update Material Tracker / Material KPI
    const materialResult = await sendDataToSheet('Materials', 'GET', { ProjectID: projectID });
    if (materialResult.status === 'success') {
        renderMaterials(materialResult.data);
        calculateMaterialKPI(materialResult.data);
    } else {
        console.error('Failed to load materials:', materialResult.message);
        renderMaterials([]);
    }

    // 4. Load Expenses and Update Expense Tracker / Expense KPI
    const expenseResult = await sendDataToSheet('Expenses', 'GET', { ProjectID: projectID });
    if (expenseResult.status === 'success') {
        renderExpenses(expenseResult.data);
        calculateExpenseKPI(expenseResult.data);
    } else {
        console.error('Failed to load expenses:', expenseResult.message);
        renderExpenses([]);
    }
}

/**
 * Updates the Project Details panel and related date/value KPIs.
 */
function updateProjectDetails(project) {
    document.getElementById('display-name').textContent = project.Name || 'N/A';
    document.getElementById('display-start-date').textContent = project.StartDate || 'N/A';
    document.getElementById('display-deadline').textContent = project.Deadline || 'N/A';
    document.getElementById('display-location').textContent = project.ProjectLocation || 'N/A';
    document.getElementById('display-amount').textContent = `₹ ${formatNumber(project.Budget)}` || 'N/A'; // Use Budget
    document.getElementById('display-contractor').textContent = project.Contractor || 'N/A';
    document.getElementById('display-engineers').textContent = project.Engineers || 'N/A';
    document.getElementById('display-contact1').textContent = project.Contact1 || 'N/A';
    document.getElementById('display-contact2').textContent = project.Contact2 || 'N/A';

    // Update Project Value KPI
    const kpiWorkOrder = document.getElementById('kpi-work-order');
    if(kpiWorkOrder) kpiWorkOrder.textContent = `₹ ${formatNumber(project.Budget || 0)}`;

    // Calculate Date KPIs
    const startDate = project.StartDate ? new Date(project.StartDate) : null;
    const deadline = project.Deadline ? new Date(project.Deadline) : null;
    const today = new Date();

    if (startDate) {
        const timeSpent = today.getTime() - startDate.getTime();
        const daysSpent = Math.floor(timeSpent / (1000 * 60 * 60 * 24));
        document.getElementById('kpi-days-spent').textContent = daysSpent >= 0 ? `${daysSpent} days` : '0 days';
    } else {
        document.getElementById('kpi-days-spent').textContent = 'N/A';
    }

    if (deadline) {
        const timeRemaining = deadline.getTime() - today.getTime();
        const daysLeft = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
        document.getElementById('kpi-days-left').textContent = daysLeft >= 0 ? `${daysLeft} days left` : 'OVERDUE!';
        if (daysLeft < 0) {
            document.getElementById('kpi-days-left').classList.add('overdue');
        } else {
            document.getElementById('kpi-days-left').classList.remove('overdue');
        }
    } else {
        document.getElementById('kpi-days-left').textContent = 'N/A';
    }
}

// --- 6. TASK TRACKER LOGIC ---

function renderTasks(tasks) {
    const taskTableBody = document.getElementById('taskTableBody');
    if (!taskTableBody) return;
    
    taskTableBody.innerHTML = '';
    const taskSelector = document.getElementById('taskId');
    if (taskSelector) taskSelector.innerHTML = '<option value="">-- Select a Task --</option>'; // Clear selector

    if (tasks.length === 0) {
        taskTableBody.innerHTML = '<tr><td colspan="5">No tasks found for this project.</td></tr>';
        return;
    }

    tasks.forEach(task => {
        const row = taskTableBody.insertRow();
        const statusClass = task.Status.toLowerCase().replace(' ', '-');

        row.insertCell().textContent = task.TaskName;
        row.insertCell().textContent = task.Responsible;
        
        // Progress Cell
        const progressCell = row.insertCell();
        progressCell.innerHTML = `<span class="progress-bar-wrap"><span class="progress-bar" style="width: ${task.Progress}%;"></span></span> ${task.Progress}%`;

        row.insertCell().textContent = task.DueDate || 'N/A';
        
        // Status Cell
        const statusCell = row.insertCell();
        statusCell.innerHTML = `<span class="status-badge status-${statusClass}">${task.Status}</span>`;

        // Populate the dropdown selector
        if (taskSelector) {
            const option = document.createElement('option');
            option.value = task.TaskID;
            option.textContent = `${task.TaskName} (${task.Progress}%)`;
            taskSelector.appendChild(option);
        }
    });
}

function calculateTaskKPI(tasks) {
    if (tasks.length === 0) {
        document.getElementById('kpi-progress').textContent = '0%';
        return;
    }
    const totalProgress = tasks.reduce((sum, task) => sum + (parseFloat(task.Progress) || 0), 0);
    const averageProgress = Math.round(totalProgress / tasks.length);
    document.getElementById('kpi-progress').textContent = `${averageProgress}%`;
}


const updateTaskForm = document.getElementById('updateTaskForm');
if (updateTaskForm) {
    updateTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const taskID = document.getElementById('taskId').value;
        const progress = document.getElementById('taskProgress').value;
        const dueDate = document.getElementById('taskDue').value;

        if (!currentProjectID) {
            showMessageBox('Please select a project first.', 'alert');
            return;
        }
        if (!taskID) {
            showMessageBox('Please select a task to update.', 'alert');
            return;
        }

        const status = progress === '100' ? 'Completed' : (progress === '0' ? 'Pending' : 'In Progress');
        
        const updatedData = {
            ProjectID: currentProjectID,
            TaskID: taskID,
            Progress: progress,
            DueDate: dueDate,
            Status: status,
        };

        // Note: The GAS PUT handler currently only searches by ProjectID. 
        // For a Tasks sheet, it would need to search by both ProjectID and TaskID.
        // Assuming your backend is modified to handle multi-key search for now:
        const result = await sendDataToSheet('Tasks', 'PUT', updatedData);

        if (result.status === 'success') {
            await updateDashboard(currentProjectID);
            showMessageBox(`Task ${taskID} updated successfully!`, 'success');
        } else {
            showMessageBox(`Failed to update task: ${result.message}`, 'error');
        }
    });
}


// --- 7. MATERIAL TRACKER LOGIC ---

function renderMaterials(materials) {
    const materialTableBody = document.getElementById('materialTableBody');
    if (!materialTableBody) return;
    
    materialTableBody.innerHTML = '';
    const materialItemIdSelector = document.getElementById('materialItemId');
    if (materialItemIdSelector) materialItemIdSelector.innerHTML = '<option value="">-- Select Existing Material --</option>';

    if (materials.length === 0) {
        materialTableBody.innerHTML = '<tr><td colspan="5">No materials loaded for this project.</td></tr>';
        return;
    }
    
    materials.forEach((material, index) => {
        const required = parseFloat(material.RequiredQuantity) || 0;
        const dispatched = parseFloat(material.DispatchedQuantity) || 0;
        const balance = required - dispatched;
        const progress = required > 0 ? Math.round((dispatched / required) * 100) : 0;
        const unit = material.Unit || 'Unit';

        const row = materialTableBody.insertRow();
        
        row.insertCell().textContent = material.MaterialName;
        row.insertCell().textContent = `${formatNumber(required)} ${unit}`;
        row.insertCell().textContent = `${formatNumber(dispatched)} ${unit}`;
        row.insertCell().textContent = `${formatNumber(balance)} ${unit}`;
        
        // Progress Cell
        const progressCell = row.insertCell();
        progressCell.innerHTML = `<span class="progress-bar-wrap"><span class="progress-bar ${progress === 100 ? 'bg-success' : ''}" style="width: ${progress}%;"></span></span> ${progress}%`;

        // Populate the dropdown selector
        if (materialItemIdSelector) {
            const option = document.createElement('option');
            // Assuming MaterialName is unique enough or the backend can handle lookups
            option.value = material.MaterialName; 
            option.textContent = `${material.MaterialName} (${balance} ${unit} remaining)`;
            materialItemIdSelector.appendChild(option);
        }
    });
}

function calculateMaterialKPI(materials) {
    if (materials.length === 0) {
        document.getElementById('kpi-material-progress').textContent = '0% Dispatched';
        return;
    }
    
    const totalRequired = materials.reduce((sum, m) => sum + (parseFloat(m.RequiredQuantity) || 0), 0);
    const totalDispatched = materials.reduce((sum, m) => sum + (parseFloat(m.DispatchedQuantity) || 0), 0);

    let overallProgress = 0;
    if (totalRequired > 0) {
        overallProgress = Math.round((totalDispatched / totalRequired) * 100);
    }
    document.getElementById('kpi-material-progress').textContent = `${overallProgress}% Dispatched`;
}


const recordDispatchForm = document.getElementById('recordDispatchForm');
if (recordDispatchForm) {
    recordDispatchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentProjectID) {
            showMessageBox('Please select a project first.', 'alert');
            return;
        }

        const materialItemId = document.getElementById('materialItemId').value;
        const newMaterialName = document.getElementById('newMaterialName').value.trim();
        const requiredQuantity = parseFloat(document.getElementById('requiredQuantity').value) || 0;
        const dispatchQuantity = parseFloat(document.getElementById('dispatchQuantity').value) || 0;
        const materialUnit = document.getElementById('materialUnit').value;

        let result;

        if (materialItemId) {
            // Case 1: Updating an existing material (Dispatch)
            // This requires the backend to implement a custom update logic (PUT) for materials.
            // For simplicity and immediate fix, we'll assume the front-end sends a PUT
            // with the updated DispatchQuantity (Backend would need to handle the sum)
            const materialToUpdate = allProjects.find(p => p.ProjectID === currentProjectID).Materials.find(m => m.MaterialName === materialItemId);
            
            const updatedData = {
                ProjectID: currentProjectID,
                MaterialName: materialItemId,
                // Assuming backend logic handles adding dispatchQuantity to the existing DispatchedQuantity
                DispatchQuantity: dispatchQuantity // Front-end sends the new dispatch amount
            };

            result = await sendDataToSheet('Materials', 'PUT', updatedData); // PUT logic in GAS must be robust

        } else if (newMaterialName) {
            // Case 2: Adding a new material (POST)
            const newMaterialData = {
                ProjectID: currentProjectID,
                MaterialName: newMaterialName,
                RequiredQuantity: requiredQuantity,
                DispatchedQuantity: dispatchQuantity,
                Unit: materialUnit
            };
            result = await sendDataToSheet('Materials', 'POST', newMaterialData);

        } else {
            showMessageBox('Please select an existing material or enter a new material name.', 'alert');
            return;
        }

        if (result.status === 'success') {
            await updateDashboard(currentProjectID);
            recordDispatchForm.reset();
            showMessageBox(`Material dispatch/entry recorded successfully!`, 'success');
        } else {
            showMessageBox(`Failed to record material entry: ${result.message}`, 'error');
        }
    });
}


// --- 8. EXPENSE TRACKER LOGIC ---

function renderExpenses(expenses) {
    const recentExpensesList = document.getElementById('recentExpensesList');
    if (!recentExpensesList) return;
    
    recentExpensesList.innerHTML = '';

    if (expenses.length === 0) {
        recentExpensesList.innerHTML = '<li class="placeholder">No expenses loaded...</li>';
        return;
    }
    
    // Sort by Date descending (most recent first) and show top 10
    expenses.sort((a, b) => new Date(b.Date) - new Date(a.Date));
    
    expenses.slice(0, 10).forEach(expense => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${expense.Date}</strong>: ${expense.Description} (${expense.Category}) - <span class="expense-amount">₹ ${formatNumber(expense.Amount)}</span>`;
        recentExpensesList.appendChild(li);
    });
}

function calculateExpenseKPI(expenses) {
    const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.Amount) || 0), 0);
    document.getElementById('kpi-total-expenses').textContent = `₹ ${formatNumber(totalExpenses)}`;
}

const expenseEntryForm = document.getElementById('expenseEntryForm');
if (expenseEntryForm) {
    expenseEntryForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentProjectID) {
            showMessageBox('Please select a project first.', 'alert');
            return;
        }

        const newExpenseData = {
            ProjectID: currentProjectID,
            Date: document.getElementById('expenseDate').value,
            Description: document.getElementById('expenseDescription').value,
            Amount: parseFloat(document.getElementById('expenseAmount').value) || 0,
            Category: document.getElementById('expenseCategory').value,
            RecordedBy: 'User (App)' // Placeholder for user identity
        };

        const result = await sendDataToSheet('Expenses', 'POST', newExpenseData);

        if (result.status === 'success') {
            await updateDashboard(currentProjectID);
            expenseEntryForm.reset();
            showMessageBox(`Expense of ₹${formatNumber(newExpenseData.Amount)} recorded successfully!`, 'success');
        } else {
            showMessageBox(`Failed to record expense: ${result.message}`, 'error');
        }
    });
}


// --- 9. PROJECT MANAGEMENT (NEW, EDIT, DELETE) ---

const newProjectModal = document.getElementById('newProjectModal');
const addProjectBtn = document.getElementById('addProjectBtn');
const closeModalButtons = document.querySelectorAll('.modal .close-button');

if (addProjectBtn) {
    addProjectBtn.addEventListener('click', () => {
        if(newProjectModal) newProjectModal.style.display = 'flex';
    });
}

closeModalButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        if(newProjectModal) newProjectModal.style.display = 'none';
        const projectDetailsEdit = document.getElementById('projectDetailsEdit');
        const projectDetailsDisplay = document.getElementById('projectDetailsDisplay');
        if(projectDetailsEdit) projectDetailsEdit.style.display = 'none';
        if(projectDetailsDisplay) projectDetailsDisplay.style.display = 'block';
    });
});

window.addEventListener('click', (event) => {
    if (event.target === newProjectModal) {
        if(newProjectModal) newProjectModal.style.display = 'none';
    }
});


const newProjectForm = document.getElementById('newProjectForm');
if (newProjectForm) {
    newProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newProjectID = document.getElementById('newProjectID').value.trim();
        if (!newProjectID) {
            showMessageBox('Project ID cannot be empty.', 'alert');
            return;
        }
        
        // --- CRITICAL FIX: Changed keys from ProjectName/ProjectValue to Name/Budget ---
        const projectData = {
            ProjectID: newProjectID,
            Name: document.getElementById('newProjectName').value, // FIX: Matches Sheet Header 'Name'
            ClientName: document.getElementById('newClientName').value,
            ProjectLocation: document.getElementById('newProjectLocation').value,
            StartDate: document.getElementById('newProjectStartDate').value, // FIX: Matches Sheet Header 'StartDate'
            Deadline: document.getElementById('newProjectDeadline').value, // FIX: Matches Sheet Header 'Deadline'
            Budget: parseFloat(document.getElementById('newProjectValue').value) || 0, // FIX: Matches Sheet Header 'Budget'
            ProjectType: document.getElementById('newProjectType').value,
            Contractor: '',
            Engineers: '',
            Contact1: '',
            Contact2: '',
            CreationDate: new Date().toISOString().split('T')[0]
        };
        // -----------------------------------------------------------------------------

        const initialTasks = HI_TEK_TASKS_MAP.map((task, index) => ({
            ProjectID: newProjectID,
            TaskID: `${newProjectID}-T${index + 1}`,
            TaskName: task.Name,
            Responsible: task.Responsible,
            DueDate: '', 
            Progress: '0',
            Status: 'Pending',
        }));

        // 1. Create the project record
        const projectResult = await sendDataToSheet('Projects', 'POST', projectData);

        if (projectResult.status !== 'success') {
             showMessageBox(`Failed to create project: ${projectResult.message || 'Unknown error.'}`, 'error');
             return;
        }

        // 2. Sequentially create the initial tasks
        const taskPromises = initialTasks.map(task => 
            sendDataToSheet('Tasks', 'POST', task)
        );
        const taskResults = await Promise.all(taskPromises);
        
        const failedTasks = taskResults.filter(r => r.status !== 'success');
        
        if (failedTasks.length === 0) {
            if(newProjectModal) newProjectModal.style.display = 'none';
            if(newProjectForm) newProjectForm.reset();
            currentProjectID = newProjectID; // Set new project as current
            await loadProjects();
            showMessageBox(`Project ${projectData.Name} created successfully with ${initialTasks.length} initial tasks!`, 'success');
        } else {
            // Show a mixed success/error message
            if(newProjectModal) newProjectModal.style.display = 'none';
            if(newProjectForm) newProjectForm.reset();
            currentProjectID = newProjectID; 
            await loadProjects(); 
            showMessageBox(`Project created, but ${failedTasks.length} tasks failed to save. Please check your API script.`, 'alert');
        }
    });
}

// --- Edit Project Details Logic ---
const editProjectDetailsBtn = document.getElementById('editProjectDetailsBtn');
const saveProjectDetailsBtn = document.getElementById('saveProjectDetailsBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

function toggleEditMode(enable) {
    const display = document.getElementById('projectDetailsDisplay');
    const edit = document.getElementById('projectDetailsEdit');
    if(display && edit) {
        display.style.display = enable ? 'none' : 'block';
        edit.style.display = enable ? 'block' : 'none';
    }
}

if (editProjectDetailsBtn) {
    editProjectDetailsBtn.addEventListener('click', () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to edit.', 'alert');
            return;
        }

        const project = allProjects.find(p => p.ProjectID === currentProjectID);
        if (!project) return;
        
        // Populate the edit form fields
        document.getElementById('editProjectID').value = project.ProjectID;
        document.getElementById('editProjectName').value = project.Name || ''; // FIX: Name
        document.getElementById('editClientName').value = project.ClientName || '';
        document.getElementById('editProjectStartDate').value = project.StartDate || '';
        document.getElementById('editProjectDeadline').value = project.Deadline || '';
        document.getElementById('editProjectLocation').value = project.ProjectLocation || '';
        document.getElementById('editProjectValue').value = project.Budget || 0; // FIX: Budget
        document.getElementById('editProjectType').value = project.ProjectType || 'Residential';
        document.getElementById('editContractor').value = project.Contractor || '';
        document.getElementById('editEngineers').value = project.Engineers || '';
        document.getElementById('editContact1').value = project.Contact1 || '';
        document.getElementById('editContact2').value = project.Contact2 || '';

        toggleEditMode(true);
    });
}

if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => toggleEditMode(false));
}

const projectEditForm = document.getElementById('projectEditForm');
if (projectEditForm) {
    projectEditForm.addEventListener('click', async (e) => {
        // We listen on the form but check the specific save button click
        if (e.target.id !== 'saveProjectDetailsBtn') return; 
        e.preventDefault();

        // --- CRITICAL FIX: Changed keys from ProjectName/ProjectValue to Name/Budget ---
        const updatedData = {
            ProjectID: document.getElementById('editProjectID').value,
            Name: document.getElementById('editProjectName').value, // FIX: Matches Sheet Header 'Name'
            ClientName: document.getElementById('editClientName').value,
            ProjectLocation: document.getElementById('editProjectLocation').value,
            StartDate: document.getElementById('editProjectStartDate').value, // FIX: Matches Sheet Header 'StartDate'
            Deadline: document.getElementById('editProjectDeadline').value, // FIX: Matches Sheet Header 'Deadline'
            Budget: parseFloat(document.getElementById('editProjectValue').value), // FIX: Matches Sheet Header 'Budget'
            ProjectType: document.getElementById('editProjectType').value,
            Contractor: document.getElementById('editContractor').value,
            Engineers: document.getElementById('editEngineers').value,
            Contact1: document.getElementById('editContact1').value,
            Contact2: document.getElementById('editContact2').value,
        };
        // -----------------------------------------------------------------------------

        const result = await sendDataToSheet('Projects', 'PUT', updatedData);

        if (result.status === 'success') {
            toggleEditMode(false);
            await loadProjects(); // Reload projects and dashboard
            showMessageBox(`Project ${updatedData.Name} updated successfully!`, 'success');
        } else {
            showMessageBox(`Failed to update project: ${result.message}`, 'error');
        }
    });
}

// --- Delete Project Logic ---
const deleteProjectBtn = document.getElementById('deleteProjectBtn');

if (deleteProjectBtn) {
    deleteProjectBtn.addEventListener('click', async () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to delete.', 'alert');
            return;
        }

        // NOTE: A real app should use a confirmation modal here, not console log.
        console.warn(`Attempting to delete project: ${currentProjectID}. This action is permanent.`);
        
        const projectToDeleteName = allProjects.find(p => p.ProjectID === currentProjectID)?.Name || currentProjectID;

        // Perform DELETE operation
        const result = await sendDataToSheet('Projects', 'DELETE', { ProjectID: currentProjectID });

        if (result.status === 'success') {
            currentProjectID = null; // Clear current selection
            await loadProjects(); // Reload projects
            showMessageBox(`Project ${projectToDeleteName} deleted successfully.`, 'success');
        } else {
            showMessageBox(`Failed to delete project: ${result.message}`, 'error');
        }
    });
}


// --- 10. HELPER FUNCTIONS ---

function formatNumber(num) {
    return new Intl.NumberFormat('en-IN', { 
        style: 'decimal', 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
    }).format(num);
}


// --- 11. INITIALIZATION ---

window.onload = loadProjects;
