// ==============================================================================
// script.js: FINAL OPERATIONAL VERSION (Apps Script Compatibility Fix)
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
    { Name: '8. Compare Costs', Responsible: 'Procurement Manager/Cost Analyst' },
    { Name: '9. Manage Materials', Responsible: 'Procurement Manager/Warehouse Supervisor' },
    { Name: '10. Prepare BOQ for Production', Responsible: 'Production Planner' },
    { Name: '11. Approval from Director', Responsible: 'Director/General Manager' },
    { Name: '12. Prepare Invoices', Responsible: 'Accounts Manager' },
    { Name: '13. Dispatch Materials', Responsible: 'Logistics Team' },
    { Name: '14. Project Execution', Responsible: 'Field Team' },
    { Name: '15. Quality Check', Responsible: 'Quality Inspector' },
    { Name: '16. Rectification and Re-Check', Responsible: 'Site Engineer/Field Team' },
    { Name: '17. Final Measurements', Responsible: 'Surveyor/Field Engineer' },
    { Name: '18. Final Approval', Responsible: 'Quality Inspector/Project Manager' },
    { Name: '19. Final Invoice Submission', Responsible: 'Accounts Manager' },
    { Name: '20. Handover Documentation', Responsible: 'Project Manager' },
    { Name: '21. Project Completion Certificate', Responsible: 'Director/Client' },
    { Name: '22. Warranty and Maintenance Schedule', Responsible: 'Service Team' },
    { Name: '23. Project Archiving', Responsible: 'Admin' }
];


// --- 2. UTILITY FUNCTIONS ---

/**
 * Sends data to the Google Sheets API proxy.
 * @param {string} sheetName - The name of the sheet to interact with (e.g., 'Projects', 'Tasks').
 * @param {string} method - The HTTP method to use (e.g., 'GET', 'POST', 'PUT', 'DELETE').
 * @param {Object} data - The payload to send (for POST/PUT, this is the record; for POST_BATCH, this is {data: [...]}).
 * @returns {Promise<Object>} The JSON response from the API.
 */
async function sendDataToSheet(sheetName, method, data = {}) {
    let payload = { sheetName, method };

    // Structure the payload based on the method type
    if (['POST', 'PUT', 'DELETE'].includes(method)) {
        // For single-record operations, wrap the data in a 'record' key.
        // This prevents the record properties from mixing with sheetName/method.
        payload.record = data;
    } else if (method.includes('BATCH')) {
        // For batch operations (like POST_BATCH), assume the data object already contains
        // the required keys (e.g., { data: [...] }) and spread it.
        payload = { ...payload, ...data };
    } else {
        // For GET operations (where 'data' contains query params like ProjectID), spread it
        payload = { ...payload, ...data };
    }
    
    // Convert GET to POST for Google Apps Script compatibility,
    // sending all query parameters in the body.
    const fetchMethod = 'POST'; 

    try {
        const response = await fetch(SHEET_API_URL, {
            method: fetchMethod,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        return await response.json();

    } catch (error) {
        console.error(`Error in sendDataToSheet (${sheetName}, ${method}):`, error);
        return { status: 'error', message: error.message };
    }
}

/**
 * Calculates the number of days between two dates.
 * @param {string} startDateString - Date string (YYYY-MM-DD).
 * @param {string} endDateString - Date string (YYYY-MM-DD).
 * @returns {number} Number of full days.
 */
function calculateDaysDifference(startDateString, endDateString) {
    const start = new Date(startDateString);
    const end = new Date(endDateString);
    const diffTime = Math.abs(end - start);
    // Convert ms to days. Add 1 to count the start day itself.
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}


// --- 3. PROJECT LOADING AND SELECTION ---

const projectSelector = document.getElementById('projectSelector');
const currentProjectNameDisplay = document.getElementById('currentProjectName');

if (projectSelector) {
    projectSelector.addEventListener('change', (e) => {
        currentProjectID = e.target.value;
        if (currentProjectID) {
            const selectedProject = allProjects.find(p => p.ProjectID === currentProjectID);
            if (selectedProject) {
                updateDashboard(selectedProject);
            }
        }
    });
}


async function loadProjects() {
    // Clear previous state
    allProjects = [];
    projectSelector.innerHTML = '<option value="">Loading Projects...</option>';
    
    const response = await sendDataToSheet('Projects', 'GET', {});

    if (response.status === 'success' && response.data && response.data.length > 0) {
        allProjects = response.data;
        populateProjectSelector(allProjects);
        
        // Auto-select the first project or the previously selected one
        currentProjectID = currentProjectID || allProjects[0].ProjectID;
        projectSelector.value = currentProjectID;
        
        const initialProject = allProjects.find(p => p.ProjectID === currentProjectID);
        if (initialProject) {
            await updateDashboard(initialProject);
        }

    } else {
        projectSelector.innerHTML = '<option value="">No Projects Found</option>';
        updateDashboard(null);
    }
}

function populateProjectSelector(projects) {
    projectSelector.innerHTML = '<option value="">-- Select Project --</option>';
    projects.forEach(project => {
        const option = document.createElement('option');
        option.value = project.ProjectID;
        option.textContent = project.ProjectName;
        projectSelector.appendChild(option);
    });
}


// --- 4. DASHBOARD UPDATE (Master Controller) ---

async function updateDashboard(project) {
    if (!project) {
        currentProjectID = null;
        currentProjectNameDisplay.textContent = 'Select a Project';
        document.getElementById('taskList').innerHTML = '<li class="placeholder">Select a project to view tasks...</li>';
        document.getElementById('recentExpensesList').innerHTML = '<li class="placeholder">No expenses loaded...</li>';
        // Reset KPIs and Details to N/A
        document.querySelectorAll('.dashboard-grid .value, #projectDetailDisplay span').forEach(el => {
            el.textContent = 'N/A';
        });
        return;
    }

    currentProjectID = project.ProjectID;
    currentProjectNameDisplay.textContent = project.ProjectName;

    // A. Update Project Details
    renderProjectDetails(project);
    
    // B. Fetch Tasks and Expenses concurrently
    const [tasksResponse, expensesResponse] = await Promise.all([
        sendDataToSheet('Tasks', 'GET', { ProjectID: currentProjectID }),
        sendDataToSheet('Expenses', 'GET', { ProjectID: currentProjectID })
    ]);

    const tasks = tasksResponse.status === 'success' ? tasksResponse.data : [];
    const expenses = expensesResponse.status === 'success' ? expensesResponse.data : [];

    // C. Render Lists
    renderTaskList(tasks);
    renderExpenses(expenses);

    // D. Update KPIs (Requires all data)
    updateKPIs(project, tasks, expenses);
}


// --- 5. DATA RENDERING FUNCTIONS ---

function renderProjectDetails(project) {
    document.getElementById('detailClientName').textContent = project.ClientName || 'N/A';
    document.getElementById('detailProjectLocation').textContent = project.ProjectLocation || 'N/A';
    document.getElementById('detailProjectStartDate').textContent = project.ProjectStartDate || 'N/A';
    document.getElementById('detailProjectDeadline').textContent = project.ProjectDeadline || 'N/A';
    document.getElementById('detailProjectValue').textContent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(parseFloat(project.ProjectValue) || 0);
    document.getElementById('detailProjectType').textContent = project.ProjectType || 'N/A';
}

function renderTaskList(tasks) {
    const taskListElement = document.getElementById('taskList');
    taskListElement.innerHTML = ''; // Clear existing tasks

    if (tasks.length === 0) {
        taskListElement.innerHTML = '<li class="placeholder">No tasks defined for this project.</li>';
        return;
    }

    // Sort by completion status (Incomplete first) and then by Task Name
    tasks.sort((a, b) => {
        if (a.Completed === b.Completed) {
            return a.TaskName.localeCompare(b.TaskName);
        }
        return a.Completed === 'No' ? -1 : 1;
    });

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.dataset.taskid = task.TaskID;
        li.className = task.Completed === 'Yes' ? 'completed' : '';

        const statusClass = task.Completed === 'Yes' ? 'complete' : 'pending';
        const statusText = task.Completed === 'Yes' ? 'Completed' : 'Pending';

        li.innerHTML = `
            <div class="task-info">
                <strong>${task.TaskName}</strong>
                <span class="task-date">Due: ${task.DueDate || 'N/A'}</span>
                <span class="task-responsible">Responsible: ${task.Responsible}</span>
            </div>
            <button class="task-status-btn ${statusClass}" data-action="toggle">
                ${statusText}
            </button>
        `;
        taskListElement.appendChild(li);
    });
}

function renderExpenses(expenses) {
    const expensesListElement = document.getElementById('recentExpensesList');
    expensesListElement.innerHTML = '';

    if (expenses.length === 0) {
        expensesListElement.innerHTML = '<li class="placeholder">No expenses recorded for this project.</li>';
        return;
    }

    // Sort by Date (most recent first) and show only the top 10
    expenses.sort((a, b) => new Date(b.Date) - new Date(a.Date));
    const recentExpenses = expenses.slice(0, 10);
    
    const formatter = new Intl.NumberFormat('en-IN');

    recentExpenses.forEach(expense => {
        const li = document.createElement('li');
        li.innerHTML = `
            <strong>${expense.Date}</strong>: ${expense.Description} 
            (<span style="color:#dc3545;">- INR ${formatter.format(parseFloat(expense.Amount))}</span>) 
            [${expense.Category}]
        `;
        expensesListElement.appendChild(li);
    });
}

function updateKPIs(project, tasks, expenses) {
    const projectValue = parseFloat(project.ProjectValue) || 0;
    const projectStart = project.ProjectStartDate;
    const projectDeadline = project.ProjectDeadline;

    // Time KPIs
    const today = new Date().toISOString().split('T')[0];
    let daysSpent = 'N/A';
    let daysLeft = 'N/A';
    
    if (projectStart && projectDeadline) {
        const daysTotal = calculateDaysDifference(projectStart, projectDeadline);
        
        // Calculate days spent
        try {
            daysSpent = calculateDaysDifference(projectStart, today);
            if (daysSpent < 0) daysSpent = 0;
        } catch (e) { console.warn("Could not calculate days spent", e); daysSpent = 'N/A'; }

        // Calculate days remaining
        try {
            const deadlineDate = new Date(projectDeadline);
            const todayDate = new Date(today);
            const remaining = Math.max(0, calculateDaysDifference(today, projectDeadline));
            daysLeft = remaining;
            
            // Special case for deadlines past today
            if (todayDate > deadlineDate) {
                daysLeft = `OVERDUE by ${calculateDaysDifference(projectDeadline, today) - 1} days`;
            }

        } catch (e) { console.warn("Could not calculate days left", e); daysLeft = 'N/A'; }
    }

    // Task KPIs
    const completedTasks = tasks.filter(t => t.Completed === 'Yes').length;
    const totalTasks = tasks.length;
    
    // Expense KPIs
    const totalExpenses = expenses.reduce((sum, expense) => sum + (parseFloat(expense.Amount) || 0), 0);
    const netMargin = projectValue - totalExpenses;
    
    // Formatting
    const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

    // Apply to DOM
    document.getElementById('kpi-days-spent').textContent = daysSpent;
    document.getElementById('kpi-days-left').textContent = daysLeft;
    document.getElementById('kpi-task-completion').textContent = `${completedTasks} / ${totalTasks}`;
    document.getElementById('kpi-project-value').textContent = currencyFormatter.format(projectValue);
    document.getElementById('kpi-total-expenses').textContent = currencyFormatter.format(totalExpenses);
    document.getElementById('kpi-net-margin').textContent = currencyFormatter.format(netMargin);
    
    // Highlight margin based on value
    const marginElement = document.getElementById('kpi-net-margin');
    if (netMargin < (projectValue * 0.1) && netMargin > 0) { // <10% margin is warning
        marginElement.style.color = '#ffc107'; // Yellow
    } else if (netMargin <= 0) {
        marginElement.style.color = '#dc3545'; // Red
    } else {
        marginElement.style.color = '#28a745'; // Green
    }
}


// --- 6. TASK MANAGEMENT (Toggle Status) ---

const taskList = document.getElementById('taskList');
if (taskList) {
    taskList.addEventListener('click', async (e) => {
        const button = e.target.closest('.task-status-btn');
        if (!button || button.dataset.action !== 'toggle' || !currentProjectID) return;

        const listItem = button.closest('li');
        const taskID = listItem.dataset.taskid;
        
        const isCompleted = listItem.classList.contains('completed');
        const newStatus = isCompleted ? 'No' : 'Yes';

        button.disabled = true;

        const updatePayload = {
            ProjectID: currentProjectID,
            TaskID: taskID,
            Completed: newStatus,
        };

        const result = await sendDataToSheet('Tasks', 'PUT', updatePayload);

        if (result.status === 'success') {
            await loadProjects(); // Reload projects to update all KPIs and lists
            showMessageBox(`Task ${taskID} status updated to ${newStatus}.`, 'success');
        } else {
            showMessageBox(`Failed to update task status: ${result.message}`, 'error');
            button.disabled = false;
        }
    });
}


// --- 7. NEW PROJECT CREATION ---

const addProjectBtn = document.getElementById('addProjectBtn');
const projectModal = document.getElementById('projectModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const projectForm = document.getElementById('projectForm');

if (addProjectBtn) {
    addProjectBtn.addEventListener('click', () => {
        projectForm.reset();
        projectModal.style.display = 'block';
    });
}

if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        projectModal.style.display = 'none';
    });
}

// Close the modal if the user clicks anywhere outside of it
window.addEventListener('click', (event) => {
    if (event.target === projectModal) {
        projectModal.style.display = 'none';
    }
    const editModal = document.getElementById('projectEditModal');
    if (event.target === editModal) {
        editModal.style.display = 'none';
    }
});


if (projectForm) {
    projectForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newProjectID = Date.now().toString(); // Simple unique ID
        const projectData = {
            ProjectID: newProjectID,
            ProjectName: document.getElementById('projectName').value,
            ClientName: document.getElementById('clientName').value,
            ProjectLocation: document.getElementById('projectLocation').value,
            ProjectStartDate: document.getElementById('projectStartDate').value,
            ProjectDeadline: document.getElementById('projectDeadline').value,
            ProjectValue: parseFloat(document.getElementById('projectValue').value),
            ProjectType: document.getElementById('projectType').value,
        };

        const initialTasks = HI_TEK_TASKS_MAP.map((task, index) => ({
            ProjectID: newProjectID,
            TaskID: `${newProjectID}-T${index + 1}`,
            TaskName: task.Name,
            Responsible: task.Responsible,
            DueDate: '', // Can be set later
            Completed: 'No'
        }));

        // Send Project data and then Initial Tasks concurrently
        const [projectResult, tasksResult] = await Promise.all([
            sendDataToSheet('Projects', 'POST', projectData),
            sendDataToSheet('Tasks', 'POST_BATCH', { data: initialTasks })
        ]);

        if (projectResult.status === 'success' && tasksResult.status === 'success') {
            projectModal.style.display = 'none';
            projectForm.reset();
            await loadProjects();
            showMessageBox(`Project ${projectData.ProjectName} created successfully with ${initialTasks.length} initial tasks!`, 'success');
        } else {
            console.error("Project/Task Creation Error:", { projectResult, tasksResult });
            showMessageBox(`Failed to create project. Check console for details. Project Error: ${projectResult.message}`, 'error');
        }
    });
}


// --- 8. EXPENSE RECORDING ---

const expenseEntryForm = document.getElementById('expenseEntryForm');
if (expenseEntryForm) {
    expenseEntryForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentProjectID) {
            showMessageBox('Please select a project before recording an expense.', 'alert');
            return;
        }

        const expenseData = {
            ProjectID: currentProjectID,
            Date: document.getElementById('expenseDate').value,
            Description: document.getElementById('expenseDescription').value,
            Amount: parseFloat(document.getElementById('expenseAmount').value),
            Category: document.getElementById('expenseCategory').value,
            ExpenseID: Date.now().toString(), // Simple unique ID
        };

        const result = await sendDataToSheet('Expenses', 'POST', expenseData);

        if (result.status === 'success') {
            expenseEntryForm.reset();
            // Reset Date to today for convenience
            document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0]; 
            await updateDashboard(allProjects.find(p => p.ProjectID === currentProjectID));
            showMessageBox(`Expense recorded successfully!`, 'success');
        } else {
            showMessageBox(`Failed to record expense: ${result.message}`, 'error');
        }
    });
}

// Set initial expense date to today
if (document.getElementById('expenseDate')) {
    document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
}


// --- 9. PROJECT DELETION LOGIC ---

const deleteProjectBtn = document.getElementById('deleteProjectBtn');
if (deleteProjectBtn) {
    deleteProjectBtn.addEventListener('click', async () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to delete.', 'alert');
            return;
        }
        
        // Use showMessageBox as a custom confirmation instead of window.confirm
        if (!confirm(`Are you sure you want to permanently delete project ${currentProjectID} and ALL its associated tasks, expenses, and materials? This action cannot be undone.`)) {
             return;
        }

        const deletePayload = { ProjectID: currentProjectID };

        // Deleting related data first, then the project record itself
        const [projectDeleteResult, tasksDeleteResult, expensesDeleteResult, materialsDeleteResult] = await Promise.all([
            sendDataToSheet('Projects', 'DELETE', deletePayload),
            sendDataToSheet('Tasks', 'DELETE', deletePayload),
            sendDataToSheet('Expenses', 'DELETE', deletePayload),
            // Assuming there's a Materials sheet/endpoint
            // sendDataToSheet('Materials', 'DELETE', deletePayload)
        ]);


        if (projectDeleteResult.status === 'success') {
            showMessageBox(`Project ${currentProjectID} deleted successfully, including all associated data!`, 'success');
            await loadProjects(); 
        } else {
            console.error('Delete results:', { projectDeleteResult, tasksDeleteResult, expensesDeleteResult, materialsDeleteResult });
            showMessageBox(`Failed to delete project. Please check the console for details. Primary Error: ${projectDeleteResult.message}`, 'error');
        }
    });
}


// --- 10. PROJECT EDIT LOGIC ---

const editFormElements = {
    id: document.getElementById('editProjectID'),
    name: document.getElementById('editProjectName'),
    client: document.getElementById('editClientName'),
    location: document.getElementById('editProjectLocation'),
    start: document.getElementById('editProjectStartDate'),
    deadline: document.getElementById('editProjectDeadline'),
    value: document.getElementById('editProjectValue'),
    type: document.getElementById('editProjectType'),
    modal: document.getElementById('projectEditModal')
};

/**
 * Populates the edit form modal with the data of the currently selected project.
 * @param {Object} project - The project data object.
 */
function populateEditForm(project) {
    // CRITICAL FIX: Check if the modal and its elements were found
    if (!editFormElements.modal || !editFormElements.name) {
        console.error("FATAL ERROR: Project Edit Modal or form elements are missing from the DOM (index (1).html).", editFormElements);
        showMessageBox('Cannot open edit form. HTML elements are missing.', 'error');
        return; 
    }

    // Set values only if the element exists. This prevents the "Cannot set properties of null" error.
    if (editFormElements.id) editFormElements.id.value = project.ProjectID;
    if (editFormElements.name) editFormElements.name.value = project.ProjectName;
    if (editFormElements.client) editFormElements.client.value = project.ClientName;
    if (editFormElements.location) editFormElements.location.value = project.ProjectLocation;
    if (editFormElements.start) editFormElements.start.value = project.ProjectStartDate;
    if (editFormElements.deadline) editFormElements.deadline.value = project.ProjectDeadline;
    if (editFormElements.value) editFormElements.value.value = project.ProjectValue;
    if (editFormElements.type) editFormElements.type.value = project.ProjectType;
    
    editFormElements.modal.style.display = 'block';
}


const editProjectDetailsBtn = document.getElementById('editProjectDetailsBtn');
if (editProjectDetailsBtn) {
    editProjectDetailsBtn.addEventListener('click', () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to edit its details.', 'alert');
            return;
        }
        const currentProject = allProjects.find(p => p.ProjectID === currentProjectID);
        if (currentProject) {
            populateEditForm(currentProject);
        } else {
            showMessageBox('Error: Current project data not found.', 'error');
        }
    });
}

const cancelEditBtn = document.getElementById('cancelEditBtn');
if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
        if (editFormElements.modal) editFormElements.modal.style.display = 'none';
    });
}

const closeEditModalBtn = document.getElementById('closeEditModalBtn');
if (closeEditModalBtn) {
    closeEditModalBtn.addEventListener('click', () => {
        if (editFormElements.modal) editFormElements.modal.style.display = 'none';
    });
}

const projectEditForm = document.getElementById('projectEditForm');
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
            if (editFormElements.modal) editFormElements.modal.style.display = 'none';
            await loadProjects(); // Reload projects and dashboard
            showMessageBox(`Project ${updatedData.ProjectName} updated successfully!`, 'success');
        } else {
            showMessageBox(`Failed to update project: ${result.message}`, 'error');
        }
    });
}


// --- 11. INITIALIZATION ---

window.onload = loadProjects;
