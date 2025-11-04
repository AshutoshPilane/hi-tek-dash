// ==============================================================================
// script.js: FINAL OPERATIONAL VERSION (Fixed Dispatch/Task Updates & KPI Calculation)
// ==============================================================================

// 🎯 CRITICAL: USING THE LOCAL PROXY PATH (/api)
const SHEET_API_URL = "/api"; 

let currentProjectID = null; 
let allProjects = [];
// Store full material data to allow lookup for dispatch updates
let currentMaterialsData = []; 
let currentTasksData = []; 


// --- DUMMY FUNCTION for error/success messages (Required for error-free execution) ---
function showMessageBox(message, type) {
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
    // In a full application, this would display a nice UI modal instead of alert()
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        messageContainer.textContent = message;
        messageContainer.className = `message-box message-${type}`;
        messageContainer.style.display = 'block';
        setTimeout(() => {
            messageContainer.style.display = 'none';
        }, 5000);
    }
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


// --- 2. API COMMUNICATION ---

/**
 * Sends a request to the Google Sheets API via the Vercel proxy.
 */
async function sendDataToSheet(sheetName, method, data = {}) {
    // Add sheetName and method to the payload for the Apps Script handler
    const payload = { sheetName, method, ...data };
    
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
        
        if (projectToLoadID) {
            if (projectSelector) {
                 projectSelector.value = projectToLoadID;
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


// --- 4. DASHBOARD UPDATING AND KPI CALCULATION ---

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
        currentTasksData = taskResult.data; // Store for lookups
        renderTasks(currentTasksData);
        calculateTaskKPI(currentTasksData);
    } else {
        console.error('Failed to load tasks:', taskResult.message);
        currentTasksData = [];
        renderTasks([]);
    }

    // 3. Load Materials and Update Material Tracker / Material KPI
    const materialResult = await sendDataToSheet('Materials', 'GET', { ProjectID: projectID });
    if (materialResult.status === 'success') {
        currentMaterialsData = materialResult.data; // Store for lookups
        renderMaterials(currentMaterialsData);
        calculateMaterialKPI(currentMaterialsData);
    } else {
        console.error('Failed to load materials:', materialResult.message);
        currentMaterialsData = [];
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
    // --- Issue 1 Fix: Use formatDate for dates ---
    const startDate = formatDate(project.StartDate);
    const deadline = formatDate(project.Deadline);
    // ---------------------------------------------

    document.getElementById('display-name').textContent = project.Name || 'N/A';
    document.getElementById('display-start-date').textContent = startDate;
    document.getElementById('display-deadline').textContent = deadline;
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
        document.getElementById('kpi-days-left').textContent = daysLeft >= 0 ? `${daysLeft} days left` : 'OVERDUE!';
        const kpiDaysLeftElement = document.getElementById('kpi-days-left');
        if (daysLeft < 0) {
            kpiDaysLeftElement.classList.add('overdue');
        } else {
            kpiDaysLeftElement.classList.remove('overdue');
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
    if (taskSelector) taskSelector.innerHTML = '<option value="">-- Select a Task --</option>'; // Clear selector

    if (tasks.length === 0) {
        taskTableBody.innerHTML = '<tr><td colspan="5">No tasks found for this project.</td></tr>';
        return;
    }

    tasks.forEach(task => {
        const row = taskTableBody.insertRow();
        const progressValue = parseFloat(task.Progress) || 0; 
        const dueDateText = formatDate(task.DueDate); 
        const status = task.Status || (progressValue === 100 ? 'Completed' : (progressValue > 0 ? 'In Progress' : 'Pending'));
        const statusClass = status.toLowerCase().replace(' ', '-');


        row.insertCell().textContent = task.TaskName;
        row.insertCell().textContent = task.Responsible || 'N/A';
        
        // Progress Cell
        const progressCell = row.insertCell();
        progressCell.innerHTML = `<span class="progress-bar-wrap"><span class="progress-bar" style="width: ${progressValue}%;"></span></span> ${progressValue}%`;

        row.insertCell().textContent = dueDateText;
        
        // Status Cell
        const statusCell = row.insertCell();
        statusCell.innerHTML = `<span class="status-badge status-${statusClass}">${status}</span>`;

        // Populate the dropdown selector
        if (taskSelector) {
            const option = document.createElement('option');
            option.value = task.TaskID;
            option.textContent = `${task.TaskName} (${progressValue}%)`;
            taskSelector.appendChild(option);
        }
    });
}

// FIX: Project Progress % Calculation (Issue 4)
function calculateTaskKPI(tasks) {
    const kpiProgressElement = document.getElementById('kpi-progress');
    if (!kpiProgressElement) return;

    if (tasks.length === 0) {
        kpiProgressElement.textContent = '0%';
        return;
    }
    
    // Ensure all progress values are safely converted to numbers
    const totalProgress = tasks.reduce((sum, task) => sum + (parseFloat(task.Progress) || 0), 0);
    
    // Calculate the average progress
    const averageProgress = Math.round(totalProgress / tasks.length);
    kpiProgressElement.textContent = `${averageProgress}%`;
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

        const progressValue = parseFloat(progress) || 0;
        const status = progressValue === 100 ? 'Completed' : (progressValue === 0 ? 'Pending' : 'In Progress');
        
        // FIX: Ensure correct keys are used for the PUT request (Issue 2)
        const updatedData = {
            ProjectID: currentProjectID,
            TaskID: taskID,
            Progress: progressValue.toString(), // Send as string/number as appropriate for GAS
            DueDate: dueDate,
            Status: status,
        };

        const result = await sendDataToSheet('Tasks', 'PUT', updatedData);

        if (result.status === 'success') {
            await updateDashboard(currentProjectID);
            showMessageBox(`Task ${taskID} updated successfully!`, 'success');
        } else {
            showMessageBox(`Failed to update task: ${result.message}`, 'error');
        }
    });
}


// --- 6. MATERIAL TRACKER LOGIC ---

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
        // Safely parse numbers
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
            // Using MaterialName as the value for lookup later
            option.value = material.MaterialName; 
            option.textContent = `${material.MaterialName} (${formatNumber(balance)} ${unit} remaining)`;
            materialItemIdSelector.appendChild(option);
        }
    });
}

// FIX: Material Dispatch % KPI Calculation (Issue 3)
function calculateMaterialKPI(materials) {
    const kpiMaterialProgressElement = document.getElementById('kpi-material-progress');
    if (!kpiMaterialProgressElement) return;

    if (materials.length === 0) {
        kpiMaterialProgressElement.textContent = '0% Dispatched';
        return;
    }
    
    // Safely parse numbers
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
            // Case 1: Updating an existing material (Dispatch) (Issue 1 Fix)
            const existingMaterial = currentMaterialsData.find(m => m.MaterialName === materialItemId);
            
            if (!existingMaterial) {
                showMessageBox('Error: Existing material not found in current data.', 'error');
                return;
            }

            const currentDispatched = parseFloat(existingMaterial.DispatchedQuantity) || 0;
            const newTotalDispatched = currentDispatched + dispatchQuantity;

            // CRITICAL: Send only the necessary keys for the update
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
    
    // Sort by Date descending (most recent first) and show top 10
    expenses.sort((a, b) => new Date(b.Date) - new Date(a.Date));
    
    expenses.slice(0, 10).forEach(expense => {
        const li = document.createElement('li');
        const expenseDate = formatDate(expense.Date); // Format date
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
        
        // --- CRITICAL: Project data keys must match Sheet Headers ---
        const projectData = {
            ProjectID: newProjectID,
            Name: document.getElementById('newProjectName').value, // Matches Sheet Header 'Name'
            ClientName: document.getElementById('newClientName').value,
            ProjectLocation: document.getElementById('newProjectLocation').value,
            StartDate: document.getElementById('newProjectStartDate').value, // Matches Sheet Header 'StartDate'
            Deadline: document.getElementById('newProjectDeadline').value, // Matches Sheet Header 'Deadline'
            Budget: parseFloat(document.getElementById('newProjectValue').value) || 0, // Matches Sheet Header 'Budget'
            ProjectType: document.getElementById('newProjectType').value,
            Contractor: document.getElementById('newContractor').value,
            Engineers: document.getElementById('newEngineers').value,
            Contact1: document.getElementById('newContact1').value,
            Contact2: document.getElementById('newContact2').value,
            CreationDate: new Date().toISOString().split('T')[0]
        };
        // -----------------------------------------------------------------------------

        const initialTasks = HI_TEK_TASKS_MAP.map((task, index) => ({
            ProjectID: newProjectID,
            TaskID: `${newProjectID}-T${index + 1}`,
            TaskName: task.Name,
            Responsible: task.Responsible,
            DueDate: '', // Matches required sheet header 'DueDate'
            Progress: '0', // Matches required sheet header 'Progress'
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
        document.getElementById('editProjectStartDate').value = formatDate(project.StartDate);
        document.getElementById('editProjectDeadline').value = formatDate(project.Deadline);
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
            // Temporarily update the local project list before full reload
            const index = allProjects.findIndex(p => p.ProjectID === currentProjectID);
            if (index !== -1) {
                // Update only fields that exist in the result or form data
                allProjects[index] = { ...allProjects[index], ...updatedData };
            }
            
            toggleEditMode(false);
            await loadProjects(); // Full reload to ensure consistency
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


// --- 9. INITIALIZATION ---

window.onload = loadProjects;
