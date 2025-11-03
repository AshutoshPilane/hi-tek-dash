// =============================================================================
// script.js: FULLY REVISED FOR NEW HTML STRUCTURE & API COMPATIBILITY
// =============================================================================

// 🎯 CRITICAL: USING THE LOCAL PROXY PATH (/api)
const SHEET_API_URL = "/api"; 

let currentProjectID = null; 
let allProjects = [];

// --- DUMMY FUNCTION for error/success messages ---
function showMessageBox(message, type) {
    // Implement a proper UI notification here. For now, we use console logs.
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
    // Example: alert(message);
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
    { Name: '8. Compare Costs', Responsible: 'Estimation Engineer' },
    { Name: '9. Finalize Estimate', Responsible: 'Project Manager' },
    { Name: '10. Generate Invoice', Responsible: 'Accounts Manager' },
    { Name: '11. Submit to Client', Responsible: 'Sales/Business Development' },
    { Name: '12. Receive Payment Confirmation', Responsible: 'Accounts Manager' },
    { Name: '13. Kick-off Meeting', Responsible: 'Project Manager' },
    { Name: '14. Detailed Design/Planning', Responsible: 'Design Engineer/Project Manager' },
    { Name: '15. Procurement', Responsible: 'Procurement Manager' },
    { Name: '16. Material Delivery & Check', Responsible: 'Store Keeper/Site Engineer' },
    { Name: '17. Site Setup & Safety', Responsible: 'Site Engineer/Safety Officer' },
    { Name: '18. Installation Begins', Responsible: 'Site Engineer/Foreman' },
    { Name: '19. Quality Checks & Testing', Responsible: 'Quality Inspector' },
    { Name: '20. Handover Documentation', Responsible: 'Project Manager' },
    { Name: '21. Client Acceptance/Completion', Responsible: 'Project Manager/Client' },
    { Name: '22. Warranty & Support', Responsible: 'Service Team' },
    { Name: '23. Project Closeout', Responsible: 'Project Manager/Accounts' }
];

// --- 2. UTILITY FUNCTIONS (API Compatibility Fix) ---

/**
 * Sends data to the Google Sheets API proxy.
 * **CRITICAL FIX**: Spreads mutation data directly into the payload.
 */
async function sendDataToSheet(sheetName, method, data = {}) {
    let payload = { sheetName, method };

    // For mutation and query operations, merge the data directly into the payload.
    if (['POST', 'PUT', 'DELETE', 'GET'].includes(method)) {
        payload = { ...payload, ...data }; 
    } 
    
    // Google Apps Script is often easier to handle with POST, 
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
        showMessageBox(`API Error: ${error.message}`, 'error');
        return { status: 'error', message: error.message };
    }
}

// --- 3. PROJECT & UI MANAGEMENT ---

const projectSelector = document.getElementById('projectSelector');

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

        // Try to load the first project by default
        if (allProjects.length > 0) {
            currentProjectID = allProjects[0].ProjectID;
            projectSelector.value = currentProjectID;
            await loadDashboardData();
        }
    } else {
        console.error("Failed to load projects:", result.message);
        showMessageBox("Failed to load initial project list.", 'error');
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

    // Set the current project name in the header
    const currentProject = allProjects.find(p => p.ProjectID === currentProjectID);
    document.getElementById('currentProjectName').textContent = currentProject ? currentProject.ProjectName : 'N/A';
    
    // Reset all dashboard areas
    document.getElementById('taskTableBody').innerHTML = '<tr><td colspan="4" class="placeholder-text">Loading tasks...</td></tr>';
    document.getElementById('materialTableBody').innerHTML = '<tr><td colspan="5" class="placeholder-text">Loading materials...</td></tr>';
    document.getElementById('recentExpensesList').innerHTML = '<li class="placeholder">Loading expenses...</li>';

    // Start all API calls concurrently
    const [projectDetails, tasks, expenses, materials] = await Promise.all([
        fetchProjectDetails(),
        fetchTasks(),
        fetchExpenses(),
        fetchMaterials() // New function
    ]);

    // Render all components
    renderProjectDetails(projectDetails);
    renderTaskList(tasks);
    renderRecentExpenses(expenses);
    renderMaterials(materials); // New function
    
    // Update KPIs based on all loaded data
    updateKPIs(projectDetails, tasks, expenses, materials);
}


// --- 4. PROJECT DETAILS (Updated for in-page Edit) ---

async function fetchProjectDetails() {
    if (!currentProjectID) return null;
    const result = await sendDataToSheet('Projects', 'GET', { ProjectID: currentProjectID });
    if (result.status === 'success' && result.data.length > 0) {
        return result.data[0];
    }
    return null;
}

/**
 * Renders project data into the display and populates the edit form.
 */
function renderProjectDetails(project) {
    if (!project) {
        document.getElementById('projectDetailsDisplay').innerHTML = '<p class="placeholder-text">Project details not available.</p>';
        return;
    }

    // --- A. Populate Display View ---
    document.getElementById('display-name').textContent = project.ProjectName || 'N/A';
    document.getElementById('display-client').textContent = project.ClientName || 'N/A';
    document.getElementById('display-location').textContent = project.ProjectLocation || 'N/A';
    document.getElementById('display-start-date').textContent = project.ProjectStartDate || 'N/A';
    document.getElementById('display-deadline').textContent = project.ProjectDeadline || 'N/A';
    document.getElementById('display-value').textContent = `INR ${parseFloat(project.ProjectValue || 0).toLocaleString('en-IN')}`;
    document.getElementById('display-type').textContent = project.ProjectType || 'N/A';

    // --- B. Populate Edit Form ---
    document.getElementById('editProjectID').value = project.ProjectID;
    document.getElementById('editProjectName').value = project.ProjectName || '';
    document.getElementById('editClientName').value = project.ClientName || '';
    document.getElementById('editProjectLocation').value = project.ProjectLocation || '';
    document.getElementById('editProjectStartDate').value = project.ProjectStartDate || '';
    document.getElementById('editProjectDeadline').value = project.ProjectDeadline || '';
    document.getElementById('editProjectValue').value = parseFloat(project.ProjectValue || 0);
    document.getElementById('editProjectType').value = project.ProjectType || '';
}

/**
 * Handle in-page Project Details Edit/Save.
 */
const projectDetailsDisplay = document.getElementById('projectDetailsDisplay');
const projectDetailsEdit = document.getElementById('projectDetailsEdit');
const editProjectDetailsBtn = document.getElementById('editProjectDetailsBtn');
const saveProjectDetailsBtn = document.getElementById('saveProjectDetailsBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');

if (editProjectDetailsBtn && projectDetailsDisplay && projectDetailsEdit) {
    // 1. Toggle Edit View
    editProjectDetailsBtn.addEventListener('click', () => {
        projectDetailsDisplay.style.display = 'none';
        projectDetailsEdit.style.display = 'block';
    });

    // 2. Cancel Edit
    cancelEditBtn.addEventListener('click', () => {
        projectDetailsEdit.style.display = 'none';
        projectDetailsDisplay.style.display = 'block';
    });

    // 3. Save Changes (PUT request)
    saveProjectDetailsBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        // Get updated data from the form fields
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
            projectDetailsEdit.style.display = 'none';
            projectDetailsDisplay.style.display = 'block';
            await loadProjects(); // Reload projects and dashboard
            showMessageBox(`Project ${updatedData.ProjectName} updated successfully!`, 'success');
        } else {
            showMessageBox(`Failed to update project: ${result.message}`, 'error');
        }
    });
}


// --- 5. TASK MANAGEMENT (Updated for Table) ---

async function fetchTasks() {
    if (!currentProjectID) return [];
    const result = await sendDataToSheet('Tasks', 'GET', { ProjectID: currentProjectID });
    if (result.status === 'success' && Array.isArray(result.data)) {
        // Ensure all tasks have a progress field (default to 0 if missing)
        return result.data.map(task => ({
            ...task,
            Progress: parseInt(task.Progress || 0)
        }));
    }
    return [];
}

/**
 * Renders task data into the new <table> body and populates the Task Update dropdown.
 */
function renderTaskList(tasks) {
    const taskTableBody = document.getElementById('taskTableBody');
    const taskIdSelect = document.getElementById('taskId');
    
    taskTableBody.innerHTML = '';
    taskIdSelect.innerHTML = '<option value="">-- Select Task --</option>';

    if (!tasks || tasks.length === 0) {
        taskTableBody.innerHTML = '<tr><td colspan="4" class="placeholder-text">No tasks for this project.</td></tr>';
        return;
    }
    
    tasks.forEach(task => {
        const row = document.createElement('tr');
        const progressPercent = task.Progress;
        let progressClass = 'progress-low';
        if (progressPercent >= 50) progressClass = 'progress-medium';
        if (progressPercent >= 100) progressClass = 'progress-high';

        row.innerHTML = `
            <td>${task.TaskName}</td>
            <td>${task.DueDate || 'N/A'}</td>
            <td>${task.Responsible || 'N/A'}</td>
            <td>
                <span class="progress-bar-container">
                    <span class="progress-bar ${progressClass}" style="width:${progressPercent}%;">
                        ${progressPercent}%
                    </span>
                </span>
            </td>
        `;
        taskTableBody.appendChild(row);

        // Populate the select dropdown for updates
        const option = document.createElement('option');
        option.value = task.TaskID;
        option.textContent = `${task.TaskName} (${progressPercent}%)`;
        taskIdSelect.appendChild(option);
    });
}

// Handler for the new Task Update form
const updateTaskForm = document.getElementById('updateTaskForm');
if (updateTaskForm) {
    updateTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const taskID = document.getElementById('taskId').value;
        const progress = document.getElementById('taskProgress').value;
        const dueDate = document.getElementById('taskDue').value;

        if (!taskID) {
            showMessageBox("Please select a task to update.", 'warning');
            return;
        }

        const updatedData = {
            TaskID: taskID,
            Progress: progress,
            DueDate: dueDate
        };

        const result = await sendDataToSheet('Tasks', 'PUT', updatedData);

        if (result.status === 'success') {
            showMessageBox("Task progress updated successfully!", 'success');
            updateTaskForm.reset();
            await loadDashboardData(); // Refresh the dashboard
        } else {
            showMessageBox(`Failed to update task: ${result.message}`, 'error');
        }
    });
}


// --- 6. EXPENSE MANAGEMENT ---

async function fetchExpenses() {
    if (!currentProjectID) return [];
    const result = await sendDataToSheet('Expenses', 'GET', { ProjectID: currentProjectID });
    if (result.status === 'success' && Array.isArray(result.data)) {
        return result.data;
    }
    return [];
}

function renderRecentExpenses(expenses) {
    const recentExpensesList = document.getElementById('recentExpensesList');
    recentExpensesList.innerHTML = '';

    if (!expenses || expenses.length === 0) {
        recentExpensesList.innerHTML = '<li class="placeholder">No expenses recorded yet.</li>';
        return;
    }

    // Sort by date descending and show max 5
    const recent = expenses.sort((a, b) => new Date(b.Date) - new Date(a.Date)).slice(0, 5);
    
    recent.forEach(expense => {
        const li = document.createElement('li');
        li.innerHTML = `
            <strong>${expense.Description}</strong> - 
            <span class="expense-amount">${parseFloat(expense.Amount).toLocaleString('en-IN')} INR</span> 
            <span class="expense-category">(${expense.Category})</span>
            <span class="expense-date">${expense.Date}</span>
        `;
        recentExpensesList.appendChild(li);
    });
}

const expenseEntryForm = document.getElementById('expenseEntryForm');
if (expenseEntryForm) {
    expenseEntryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentProjectID) {
            showMessageBox("Please select a project first.", 'warning');
            return;
        }

        const newExpense = {
            ProjectID: currentProjectID,
            Date: document.getElementById('expenseDate').value,
            Description: document.getElementById('expenseDescription').value,
            Amount: parseFloat(document.getElementById('expenseAmount').value),
            Category: document.getElementById('expenseCategory').value,
        };

        const result = await sendDataToSheet('Expenses', 'POST', newExpense);

        if (result.status === 'success') {
            showMessageBox("Expense recorded successfully!", 'success');
            expenseEntryForm.reset();
            await loadDashboardData(); // Refresh the dashboard
        } else {
            showMessageBox(`Failed to record expense: ${result.message}`, 'error');
        }
    });
}


// --- 7. MATERIAL DISPATCH TRACKER (NEW FEATURE) ---

async function fetchMaterials() {
    if (!currentProjectID) return [];
    // Assuming a 'Materials' sheet exists to track dispatch
    const result = await sendDataToSheet('Materials', 'GET', { ProjectID: currentProjectID });
    if (result.status === 'success' && Array.isArray(result.data)) {
        return result.data;
    }
    return [];
}

/**
 * Renders material dispatch data into the new <table> body.
 */
function renderMaterials(materials) {
    const materialTableBody = document.getElementById('materialTableBody');
    materialTableBody.innerHTML = '';

    if (!materials || materials.length === 0) {
        materialTableBody.innerHTML = '<tr><td colspan="5" class="placeholder-text">No material records.</td></tr>';
        return;
    }

    // Logic to aggregate and calculate balance (simplistic approach)
    const materialSummary = materials.reduce((acc, record) => {
        const key = record.MaterialName;
        const isInitialBOQ = record.Type.toLowerCase() === 'boq';
        const isDispatch = record.Type.toLowerCase() === 'dispatch';

        if (!acc[key]) {
            acc[key] = {
                MaterialName: key,
                BOQ_Qty: 0,
                Dispatched_Qty: 0,
            };
        }

        if (isInitialBOQ) {
            acc[key].BOQ_Qty = parseFloat(record.Quantity || 0);
        } else if (isDispatch) {
            acc[key].Dispatched_Qty += parseFloat(record.Quantity || 0);
        }

        return acc;
    }, {});


    Object.values(materialSummary).forEach(summary => {
        const balance = summary.BOQ_Qty - summary.Dispatched_Qty;
        const progress = summary.BOQ_Qty > 0 ? ((summary.Dispatched_Qty / summary.BOQ_Qty) * 100).toFixed(0) : 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${summary.MaterialName}</td>
            <td>${summary.BOQ_Qty}</td>
            <td>${summary.Dispatched_Qty}</td>
            <td>${balance}</td>
            <td>${progress}%</td>
        `;
        materialTableBody.appendChild(row);
    });

    // Populate the materialItemId dropdown with unique material names from BOQ records
    const materialItemIdSelect = document.getElementById('materialItemId');
    materialItemIdSelect.innerHTML = '<option value="">-- Select Material --</option>';
    const uniqueMaterials = new Set(materials.filter(m => m.Type.toLowerCase() === 'boq').map(m => m.MaterialName));
    uniqueMaterials.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        materialItemIdSelect.appendChild(option);
    });
}

// Handler for the new Material Dispatch form
const recordDispatchForm = document.getElementById('recordDispatchForm');
if (recordDispatchForm) {
    recordDispatchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentProjectID) {
            showMessageBox("Please select a project first.", 'warning');
            return;
        }

        const newDispatch = {
            ProjectID: currentProjectID,
            Date: document.getElementById('dispatchDate').value,
            MaterialName: document.getElementById('materialItemId').value,
            Quantity: parseFloat(document.getElementById('dispatchQuantity').value),
            // Assuming this form is only for dispatch, not BOQ entry
            Type: 'Dispatch', 
        };

        const result = await sendDataToSheet('Materials', 'POST', newDispatch);

        if (result.status === 'success') {
            showMessageBox("Material dispatch recorded successfully!", 'success');
            recordDispatchForm.reset();
            await loadDashboardData(); // Refresh the dashboard
        } else {
            showMessageBox(`Failed to record dispatch: ${result.message}`, 'error');
        }
    });
}


// --- 8. KPI CALCULATIONS (Updated for new KPIs) ---

function updateKPIs(project, tasks, expenses, materials) {
    if (!project) return;

    // --- Time-based KPIs ---
    const startDate = new Date(project.ProjectStartDate);
    const deadlineDate = new Date(project.ProjectDeadline);
    const today = new Date();

    const totalDays = (deadlineDate - startDate) / (1000 * 60 * 60 * 24);
    const daysSpent = (today - startDate) / (1000 * 60 * 60 * 24);
    const daysLeft = (deadlineDate - today) / (1000 * 60 * 60 * 24);
    
    // Display
    document.getElementById('kpi-days-spent').textContent = Math.max(0, Math.round(daysSpent)) + ' days';
    document.getElementById('kpi-days-left').textContent = Math.max(0, Math.round(daysLeft)) + ' days';
    document.getElementById('kpi-timeline-progress').textContent = totalDays > 0 ? `${Math.min(100, (daysSpent / totalDays) * 100).toFixed(0)}%` : '0%';

    // --- Task Progress KPI ---
    const totalProgress = tasks.reduce((sum, task) => sum + task.Progress, 0);
    const averageProgress = tasks.length > 0 ? (totalProgress / tasks.length).toFixed(0) : 0;
    document.getElementById('kpi-progress').textContent = `${averageProgress}%`;

    // --- Financial KPIs ---
    const totalExpenses = expenses.reduce((sum, exp) => sum + parseFloat(exp.Amount || 0), 0);
    const projectValue = parseFloat(project.ProjectValue || 0);

    document.getElementById('kpi-work-order').textContent = `INR ${projectValue.toLocaleString('en-IN')}`;
    document.getElementById('kpi-total-expenses').textContent = `INR ${totalExpenses.toLocaleString('en-IN')}`;

    // --- Material Progress KPI ---
    const materialSummary = materials.reduce((acc, record) => {
        const key = record.MaterialName;
        const isInitialBOQ = record.Type.toLowerCase() === 'boq';
        const isDispatch = record.Type.toLowerCase() === 'dispatch';

        if (!acc[key]) {
            acc[key] = { BOQ_Qty: 0, Dispatched_Qty: 0 };
        }
        if (isInitialBOQ) { acc[key].BOQ_Qty = parseFloat(record.Quantity || 0); } 
        if (isDispatch) { acc[key].Dispatched_Qty += parseFloat(record.Quantity || 0); }
        return acc;
    }, {});

    let totalBOQ = 0;
    let totalProgressQty = 0;
    Object.values(materialSummary).forEach(summary => {
        totalBOQ += summary.BOQ_Qty;
        totalProgressQty += summary.Dispatched_Qty;
    });

    const materialProgress = totalBOQ > 0 ? ((totalProgressQty / totalBOQ) * 100).toFixed(0) : 0;
    document.getElementById('kpi-material-progress').textContent = `${materialProgress}%`;
}


// --- 9. INITIALIZATION ---

window.onload = loadProjects;
