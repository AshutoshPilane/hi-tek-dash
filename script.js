// ==============================================================================
// script.js: FINAL OPERATIONAL VERSION (Fixed Sequential Tasks & Delete Bug)
// ==============================================================================

// 🎯 CRITICAL: USING THE LOCAL PROXY PATH (/api)
const SHEET_API_URL = "/api"; 

let currentProjectID = null; 
let allProjects = [];
let currentMaterialsData = []; 
let currentTasksData = []; // Stores the full task data for the selected project

// --- DUMMY FUNCTION for error/success messages (Required for error-free execution) ---
function showMessageBox(message, type) {
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
    // This is a placeholder. A real app would show a UI element.
    alert(`[${type.toUpperCase()}] ${message}`);
}

// --- NEW HELPER FUNCTION: Date Formatting Fix for ISO Strings (Issue 1 Fix) ---
function formatDate(isoDateString) {
    if (!isoDateString) return 'N/A';
    // If it's a simple YYYY-MM-DD string already, return it
    if (isoDateString.length === 10 && isoDateString.includes('-')) {
        return isoDateString;
    }
    try {
        const date = new Date(isoDateString);
        // Format to YYYY-MM-DD
        return date.toISOString().split('T')[0];
    } catch (e) {
        return isoDateString; // Return original if parsing fails
    }
}

// --- NEW HELPER FUNCTION: Number Formatting for INR (₹) ---
function formatNumber(num) {
    // Ensure num is treated as a number, defaulting to 0
    const number = parseFloat(num) || 0;
    return new Intl.NumberFormat('en-IN', { 
        style: 'decimal', 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
    }).format(number);
}
// ------------------------------------------------------------------------------------

// --- 1. THE HI TEK 23-STEP WORKFLOW LIST ---
// --- 1. THE HI TEK 23-STEP WORKFLOW LIST (Corrected Sequence) ---
const HI_TEK_TASKS_MAP = [
    { Name: '1. Understanding the System', Responsible: 'Project Manager' },
    { Name: '2. Identifying Scope', Responsible: 'Site Engineer/Project coordinator' },
    { Name: '3. Measurement', Responsible: 'Surveyor/Field Engineer' },
    { Name: '4. Cross-Check Scope', Responsible: 'Site Engineer/Quality Inspector' },
    { Name: '5. Calculate Project Cost', Responsible: 'Estimation Engineer/Cost Analyst' },
    { Name: '6. Review Payment Terms', Responsible: 'Accounts Manager/Contract Specialist' },
    { Name: '7. Calculate BOQ', Responsible: 'Estimation Engineer/Procurement Manager' },
    { Name: '8. Compare Costs', Responsible: 'Procurement Manager/Cost Analyst' },
    { Name: '9. Manage Materials', Responsible: 'Procurement Manager/Warehouse Supervisor' },
    { Name: '10. Prepare BOQ for Production', Responsible: 'Production Planner' },
    { Name: '11. Approval from Director', Responsible: 'Director/General Manager' },
    { Name: '12. Production', Responsible: 'Production Supervisor' },
    { Name: '13. Post-Production Check', Responsible: 'Quality Inspector' },
    { Name: '14. Dispatch', Responsible: 'Logistics Manager' },
    { Name: '15. Installation', Responsible: 'Site Engineer/Contractor' },
    { Name: '16. Handover Measurements', Responsible: 'Surveyor/Field Engineer' },
    { Name: '17. Cross-Check Final Work', Responsible: 'Quality Inspector/Site Engineer' },
    { Name: '18. Create Abstract Invoice', Responsible: 'Accounts Manager' },
    { Name: '19. Approval from Director', Responsible: 'Director/General Manager' },
    { Name: '20. Process Invoice', Responsible: 'Accounts Executive' },
    { Name: '21. Submit Bill On-Site', Responsible: 'Accounts Executive/Project Manager' },
    { Name: '22. Payment Follow-Up', Responsible: 'Accounts Manager' },
    { Name: '23. Submit No-Objection Letter', Responsible: 'Project Manager' }
];


// --- 2. API COMMUNICATION ---

/**
 * Sends a request to the Google Sheets API via the Vercel proxy.
 */
async function sendDataToSheet(sheetName, method, data = {}) {
    const payload = { sheetName, method, ...data };
    
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
        return result;

    } catch (error) {
        console.error(`Error during API call for ${sheetName}/${method}:`, error);
        return { status: 'error', message: error.message };
    }
}


// --- 3. DATA LOADING AND SELECTION ---

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

        let projectToLoadID = null;
        if (allProjects.length > 0) {
            if (currentProjectID && allProjects.some(p => p.ProjectID === currentProjectID)) {
                projectToLoadID = currentProjectID;
            } else {
                projectToLoadID = allProjects[0].ProjectID;
            }
        }
        
        currentProjectID = projectToLoadID;
        
        if (projectToLoadID) {
            if (projectSelector) {
                 projectSelector.value = projectToLoadID;
            }
            await updateDashboard(projectToLoadID);
        } else {
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
        projectSelector.innerHTML = ''; 

        if (projects.length === 0) {
            projectSelector.innerHTML = '<option value="">No Projects Found</option>';
            return;
        }

        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.ProjectID;
            option.textContent = `${project.ProjectID} - ${project.Name}`;
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


// --- 4. DASHBOARD UPDATING AND KPI CALCULATION ---

function resetDashboard() {
    currentProjectNameDisplay.textContent = 'Select a Project';
    const kpis = ['kpi-days-spent', 'kpi-days-left', 'kpi-progress', 'kpi-material-progress', 'kpi-work-order', 'kpi-total-expenses'];
    kpis.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.textContent = id.includes('progress') ? '0%' : 'N/A';
        if(id === 'kpi-work-order' || id === 'kpi-total-expenses') el.textContent = '₹ 0';
    });
    
    document.getElementById('display-name').textContent = 'N/A';
    document.getElementById('display-start-date').textContent = 'N/A';
    document.getElementById('display-deadline').textContent = 'N/A';
    document.getElementById('display-location').textContent = 'N/A';
    document.getElementById('display-amount').textContent = 'N/A';
    document.getElementById('display-contractor').textContent = 'N/A';
    document.getElementById('display-engineers').textContent = 'N/A';
    document.getElementById('display-contact1').textContent = 'N/A';
    document.getElementById('display-contact2').textContent = 'N/A';
    
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
    
    updateProjectDetails(projectData);
    
    const taskResult = await sendDataToSheet('Tasks', 'GET', { ProjectID: projectID });
    if (taskResult.status === 'success') {
        currentTasksData = taskResult.data; 
        renderTasks(currentTasksData);
        calculateTaskKPI(currentTasksData);
    } else {
        currentTasksData = [];
        renderTasks([]);
    }

    const materialResult = await sendDataToSheet('Materials', 'GET', { ProjectID: projectID });
    if (materialResult.status === 'success') {
        currentMaterialsData = materialResult.data; 
        renderMaterials(currentMaterialsData);
        calculateMaterialKPI(currentMaterialsData);
    } else {
        currentMaterialsData = [];
        renderMaterials([]);
    }

    const expenseResult = await sendDataToSheet('Expenses', 'GET', { ProjectID: projectID });
    if (expenseResult.status === 'success') {
        renderExpenses(expenseResult.data);
        calculateExpenseKPI(expenseResult.data);
    } else {
        renderExpenses([]);
    }
}

/**
 * Updates the Project Details panel and related date/value KPIs.
 */
function updateProjectDetails(project) {
    const startDate = formatDate(project.StartDate);
    const deadline = formatDate(project.Deadline);

    document.getElementById('display-name').textContent = project.Name || 'N/A';
    document.getElementById('display-start-date').textContent = startDate;
    document.getElementById('display-deadline').textContent = deadline;
    document.getElementById('display-location').textContent = project.ProjectLocation || 'N/A';
    document.getElementById('display-amount').textContent = `₹ ${formatNumber(project.Budget)}` || 'N/A';
    document.getElementById('display-contractor').textContent = project.Contractor || 'N/A';
    document.getElementById('display-engineers').textContent = project.Engineers || 'N/A';
    document.getElementById('display-contact1').textContent = project.Contact1 || 'N/A';
    document.getElementById('display-contact2').textContent = project.Contact2 || 'N/A';

    const kpiWorkOrder = document.getElementById('kpi-work-order');
    if(kpiWorkOrder) kpiWorkOrder.textContent = `₹ ${formatNumber(project.Budget || 0)}`;

    const dateToday = new Date();
    const dateStart = new Date(startDate);
    const dateDeadline = new Date(deadline);

    if (startDate !== 'N/A') {
        const timeSpent = dateToday.getTime() - dateStart.getTime();
        const daysSpent = Math.floor(timeSpent / (1000 * 60 * 60 * 24));
        document.getElementById('kpi-days-spent').textContent = daysSpent >= 0 ? `${daysSpent} days` : '0 days';
    } else {
        document.getElementById('kpi-days-spent').textContent = 'N/A';
    }

    if (deadline !== 'N/A') {
        const timeRemaining = dateDeadline.getTime() - dateToday.getTime();
        const daysLeft = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
        const kpiDaysLeftElement = document.getElementById('kpi-days-left');
        
        if (daysLeft < 0) {
            kpiDaysLeftElement.textContent = 'OVERDUE!';
            kpiDaysLeftElement.classList.add('overdue'); // FIX: Add class
        } else {
            kpiDaysLeftElement.textContent = `${daysLeft} days left`;
            kpiDaysLeftElement.classList.remove('overdue'); // FIX: Remove class
        }
    } else {
        document.getElementById('kpi-days-left').textContent = 'N/A';
    }
}

// --- 5. TASK TRACKER LOGIC ---

function renderTasks(tasks) {
    const taskTableBody = document.getElementById('taskTableBody');
    if (!taskTableBody) return;
    
    taskTableBody.innerHTML = '';
    const taskSelector = document.getElementById('taskId');
    if (taskSelector) taskSelector.innerHTML = '<option value="">-- Select a Task --</option>'; 

    if (tasks.length === 0) {
        taskTableBody.innerHTML = '<tr><td colspan="5">No tasks found for this project.</td></tr>';
        return;
    }

    // NEW: Logic for sequential task unlocking
    let previousTaskComplete = true;

    tasks.forEach(task => {
        const row = taskTableBody.insertRow();
        const progressValue = parseFloat(task.Progress) || 0; 
        const dueDateText = formatDate(task.DueDate); 
        const status = task.Status || (progressValue === 100 ? 'Completed' : (progressValue > 0 ? 'In Progress' : 'Pending'));
        const statusClass = status.toLowerCase().replace(' ', '-');

        row.insertCell().textContent = task.TaskName;
        row.insertCell().textContent = task.Responsible || 'N/A';
        
        const progressCell = row.insertCell();
        progressCell.innerHTML = `<span class="progress-bar-wrap"><span class="progress-bar" style="width: ${progressValue}%;"></span></span> ${progressValue}%`;

        row.insertCell().textContent = dueDateText;
        
        const statusCell = row.insertCell();
        statusCell.innerHTML = `<span class="status-badge status-${statusClass}">${status}</span>`;

        // Populate the dropdown selector
        if (taskSelector) {
            const option = document.createElement('option');
            option.value = task.TaskID;
            option.textContent = `${task.TaskName} (${progressValue}%)`;
            
            // NEW: Disable task if previous one is not 100%
            if (!previousTaskComplete) {
                option.disabled = true;
            }
            taskSelector.appendChild(option);
            
            // Update flag for the *next* iteration
            if (progressValue < 100) {
                previousTaskComplete = false;
            }
        }
    });
}

function calculateTaskKPI(tasks) {
    const kpiProgressElement = document.getElementById('kpi-progress');
    if (!kpiProgressElement) return;

    if (tasks.length === 0) {
        kpiProgressElement.textContent = '0%';
        return;
    }
    
    const totalProgress = tasks.reduce((sum, task) => sum + (parseFloat(task.Progress) || 0), 0);
    const averageProgress = Math.round(totalProgress / tasks.length);
    kpiProgressElement.textContent = `${averageProgress}%`;
}


// NEW: Event listener to auto-populate progress dropdown when a task is selected
const taskSelector = document.getElementById('taskId');
if (taskSelector) {
    taskSelector.addEventListener('change', (e) => {
        const selectedTaskID = e.target.value;
        const taskProgressDropdown = document.getElementById('taskProgress');
        
        if (!selectedTaskID) {
            taskProgressDropdown.value = "0";
            return;
        }

        const task = currentTasksData.find(t => t.TaskID === selectedTaskID);
        if (task) {
            const currentProgress = parseFloat(task.Progress) || 0;
            // Round to nearest 25% increment
            const nearest25 = Math.round(currentProgress / 25) * 25;
            taskProgressDropdown.value = nearest25.toString();
        }
    });
}

const updateTaskForm = document.getElementById('updateTaskForm');
if (updateTaskForm) {
    updateTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // MODIFIED: Read from the new <select> dropdown
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

        const progressValue = parseFloat(progress) || 0;
        const status = progressValue === 100 ? 'Completed' : (progressValue === 0 ? 'Pending' : 'In Progress');
        
        const updatedData = {
            ProjectID: currentProjectID,
            TaskID: taskID,
            Progress: progressValue.toString(), 
            DueDate: dueDate,
            Status: status,
        };

        const result = await sendDataToSheet('Tasks', 'PUT', updatedData);

        if (result.status === 'success') {
            await updateDashboard(currentProjectID);
            showMessageBox(`Task updated successfully!`, 'success');
        } else {
            showMessageBox(`Failed to update task: ${result.message}`, 'error');
        }
    });
}


// --- 6. MATERIAL TRACKER LOGIC ---

// NOTE: Your material update logic was already correct.
// The code below *accumulates* dispatch quantity, which is the correct
// behavior for a "Record Dispatch" form.

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
    
    materials.forEach((material) => {
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
        
        const progressCell = row.insertCell();
        progressCell.innerHTML = `<span class="progress-bar-wrap"><span class="progress-bar ${progress === 100 ? 'bg-success' : ''}" style="width: ${progress}%;"></span></span> ${progress}%`;

        if (materialItemIdSelector) {
            const option = document.createElement('option');
            option.value = material.MaterialName; 
            option.textContent = `${material.MaterialName} (${formatNumber(balance)} ${unit} remaining)`;
            materialItemIdSelector.appendChild(option);
        }
    });
}

function calculateMaterialKPI(materials) {
    const kpiMaterialProgressElement = document.getElementById('kpi-material-progress');
    if (!kpiMaterialProgressElement) return;

    if (materials.length === 0) {
        kpiMaterialProgressElement.textContent = '0% Dispatched';
        return;
    }
    
    const totalRequired = materials.reduce((sum, m) => sum + (parseFloat(m.RequiredQuantity) || 0), 0);
    const totalDispatched = materials.reduce((sum, m) => sum + (parseFloat(m.DispatchedQuantity) || 0), 0);

    let overallProgress = 0;
    if (totalRequired > 0) {
        overallProgress = Math.round((totalDispatched / totalRequired) * 100);
    }
    kpiMaterialProgressElement.textContent = `${overallProgress}% Dispatched`;
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
            const existingMaterial = currentMaterialsData.find(m => m.MaterialName === materialItemId);
            
            if (!existingMaterial) {
                showMessageBox('Error: Existing material not found in current data.', 'error');
                return;
            }
            
            // This logic is CORRECT. It *adds* the new dispatch to the existing total.
            const currentDispatched = parseFloat(existingMaterial.DispatchedQuantity) || 0;
            const newTotalDispatched = currentDispatched + dispatchQuantity;

            const updatedData = {
                ProjectID: currentProjectID,
                MaterialName: materialItemId,
                DispatchedQuantity: newTotalDispatched.toString() // Send the accumulated total
            };

            result = await sendDataToSheet('Materials', 'PUT', updatedData); 

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


// --- 7. EXPENSE TRACKER LOGIC ---

function renderExpenses(expenses) {
    const recentExpensesList = document.getElementById('recentExpensesList');
    if (!recentExpensesList) return;
    
    recentExpensesList.innerHTML = '';

    if (expenses.length === 0) {
        recentExpensesList.innerHTML = '<li class="placeholder">No expenses loaded...</li>';
        return;
    }
    
    expenses.sort((a, b) => new Date(b.Date) - new Date(a.Date));
    
    expenses.slice(0, 10).forEach(expense => {
        const li = document.createElement('li');
        const expenseDate = formatDate(expense.Date);
        li.innerHTML = `<strong>${expenseDate}</strong>: ${expense.Description} (${expense.Category}) - <span class="expense-amount">₹ ${formatNumber(expense.Amount)}</span>`;
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
            RecordedBy: 'User (App)'
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


// --- 8. PROJECT MANAGEMENT (NEW, EDIT, DELETE) ---

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
        
        // MODIFIED: Reads the new fields from the updated form
        const projectData = {
            ProjectID: newProjectID,
            Name: document.getElementById('newProjectName').value,
            ClientName: document.getElementById('newClientName').value,
            ProjectLocation: document.getElementById('newProjectLocation').value,
            StartDate: document.getElementById('newProjectStartDate').value,
            Deadline: document.getElementById('newProjectDeadline').value,
            Budget: parseFloat(document.getElementById('newProjectValue').value) || 0,
            ProjectType: document.getElementById('newProjectType').value,
            Contractor: document.getElementById('newContractor').value, // <-- FIXED
            Engineers: document.getElementById('newEngineers').value,   // <-- FIXED
            Contact1: document.getElementById('newContact1').value,     // <-- FIXED
            Contact2: document.getElementById('newContact2').value,     // <-- FIXED
            CreationDate: new Date().toISOString().split('T')[0]
        };

        const initialTasks = HI_TEK_TASKS_MAP.map((task, index) => ({
            ProjectID: newProjectID,
            TaskID: `${newProjectID}-T${index + 1}`,
            TaskName: task.Name,
            Responsible: task.Responsible,
            DueDate: '', 
            Progress: '0', 
            Status: 'Pending',
        }));

        const projectResult = await sendDataToSheet('Projects', 'POST', projectData);

        if (projectResult.status !== 'success') {
             showMessageBox(`Failed to create project: ${projectResult.message || 'Unknown error.'}`, 'error');
             return;
        }

        const taskPromises = initialTasks.map(task => 
            sendDataToSheet('Tasks', 'POST', task)
        );
        const taskResults = await Promise.all(taskPromises);
        
        const failedTasks = taskResults.filter(r => r.status !== 'success');
        
        if (failedTasks.length === 0) {
            if(newProjectModal) newProjectModal.style.display = 'none';
            if(newProjectForm) newProjectForm.reset();
            currentProjectID = newProjectID; 
            await loadProjects();
            showMessageBox(`Project ${projectData.Name} created successfully with ${initialTasks.length} initial tasks!`, 'success');
        } else {
            if(newProjectModal) newProjectModal.style.display = 'none';
            if(newProjectForm) newProjectForm.reset();
            currentProjectID = newProjectID; 
            await loadProjects(); 
            showMessageBox(`Project created, but ${failedTasks.length} tasks failed to save.`, 'alert');
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
        
        document.getElementById('editProjectID').value = project.ProjectID;
        document.getElementById('editProjectName').value = project.Name || '';
        document.getElementById('editClientName').value = project.ClientName || '';
        document.getElementById('editProjectStartDate').value = formatDate(project.StartDate);
        document.getElementById('editProjectDeadline').value = formatDate(project.Deadline);
        document.getElementById('editProjectLocation').value = project.ProjectLocation || '';
        document.getElementById('editProjectValue').value = project.Budget || 0;
        document.getElementById('editProjectType').value = project.ProjectType || 'Residential';
        document.getElementById('editContractor').value = project.Contractor || '';
        document.getElementById('editEngineers').value = project.Engineers || '';
        document.getElementById('editContact1').value = project.Contact1 || '';
        document.getElementById('editContact2').value = project.Contact2 || '';
        
        toggleEditMode(true);
    });
}

if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
        toggleEditMode(false);
    });
}

if (saveProjectDetailsBtn) {
    saveProjectDetailsBtn.addEventListener('click', async () => {
        if (!currentProjectID) return;

        const updatedData = {
            ProjectID: currentProjectID,
            Name: document.getElementById('editProjectName').value, 
            ClientName: document.getElementById('editClientName').value,
            ProjectLocation: document.getElementById('editProjectLocation').value,
            StartDate: document.getElementById('editProjectStartDate').value,
            Deadline: document.getElementById('editProjectDeadline').value,
            Budget: parseFloat(document.getElementById('editProjectValue').value) || 0,
            ProjectType: document.getElementById('editProjectType').value,
            Contractor: document.getElementById('editContractor').value,
            Engineers: document.getElementById('editEngineers').value,
            Contact1: document.getElementById('editContact1').value,
            Contact2: document.getElementById('editContact2').value,
        };

        const result = await sendDataToSheet('Projects', 'PUT', updatedData);

        if (result.status === 'success') {
            const index = allProjects.findIndex(p => p.ProjectID === currentProjectID);
            if (index !== -1) {
                allProjects[index] = { ...allProjects[index], ...updatedData };
            }
            
            toggleEditMode(false);
            await loadProjects(); 
            showMessageBox('Project details updated successfully!', 'success');
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

        const projectToDeleteName = allProjects.find(p => p.ProjectID === currentProjectID)?.Name || currentProjectID;

        // Use a real confirmation
        if (!confirm(`Are you sure you want to delete ${projectToDeleteName}?\nThis will delete ALL associated tasks, materials, and expenses.\nThis action cannot be undone.`)) {
            return;
        }

        // MODIFIED: Send DELETE requests to all 4 sheets to prevent orphaned data
        const deletePayload = { ProjectID: currentProjectID };
        
        // Show a loading message
        showMessageBox(`Deleting ${projectToDeleteName} and all its data...`, 'alert');

        try {
            const results = await Promise.all([
                sendDataToSheet('Projects', 'DELETE', deletePayload),
                sendDataToSheet('Tasks', 'DELETE', deletePayload),
                sendDataToSheet('Materials', 'DELETE', deletePayload),
                sendDataToSheet('Expenses', 'DELETE', deletePayload)
            ]);

            const failures = results.filter(res => res.status !== 'success');

            if (failures.length > 0) {
                throw new Error(failures.map(f => f.message).join(', '));
            }

            currentProjectID = null; // Clear current selection
            await loadProjects(); // Reload projects
            showMessageBox(`Project ${projectToDeleteName} was successfully deleted.`, 'success');

        } catch (error) {
             showMessageBox(`Failed to delete project: ${error.message}`, 'error');
        }
    });
}


// --- 9. INITIALIZATION ---

window.onload = loadProjects;


