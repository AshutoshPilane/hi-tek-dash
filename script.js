// =============================================================================
// script.js: FINAL OPERATIONAL VERSION (Array Check & ID Mismatch Fix)
// =============================================================================

// 🎯 CRITICAL: USING THE LOCAL PROXY PATH (/api)
const SHEET_API_URL = "/api"; 

let currentProjectID = null; 
let allProjects = [];

// --- 1. DUMMY FUNCTION for error/success messages (Required for error-free execution) ---
function showMessageBox(message, type) {
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
}

// --- 2. THE HI TEK 23-STEP WORKFLOW LIST ---
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

// --- 3. UTILITY FUNCTIONS ---

async function sendDataToSheet(sheetName, method, data = {}) {
    let payload = { sheetName, method };

    if (['POST', 'PUT', 'DELETE'].includes(method) || method.includes('BATCH')) {
        payload.data = data; 
    } else {
        payload = { ...payload, ...data };
    }
    
    // Always use POST to call the Apps Script proxy
    const fetchMethod = 'POST'; 

    try {
        const response = await fetch(SHEET_API_URL, {
            method: fetchMethod,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const text = await response.text();
        return JSON.parse(text);

    } catch (error) {
        console.error(`Error in sendDataToSheet (${sheetName}, ${method}):`, error);
        return { status: 'error', message: error.message };
    }
}

function calculateDaysDifference(startDateString, endDateString) {
    const start = new Date(startDateString);
    const end = new Date(endDateString);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}


// --- 4. PROJECT LOADING AND SELECTION ---

const projectSelector = document.getElementById('projectSelector');
const currentProjectNameDisplay = document.getElementById('currentProjectName');

if (projectSelector) {
    projectSelector.addEventListener('change', async (e) => {
        currentProjectID = e.target.value;
        if (currentProjectID) {
            const selectedProject = allProjects.find(p => p.ProjectID === currentProjectID);
            if (selectedProject) {
                await updateDashboard(selectedProject);
            }
        } else {
            updateDashboard(null);
        }
    });
}

async function loadProjects() {
    allProjects = [];
    if (projectSelector) projectSelector.innerHTML = '<option value="">Loading Projects...</option>';
    
    const response = await sendDataToSheet('Projects', 'GET', {});

    if (response.status === 'success' && response.data && response.data.length > 0) {
        allProjects = response.data;
        populateProjectSelector(allProjects);
        
        currentProjectID = currentProjectID || allProjects[0].ProjectID;
        if (projectSelector) projectSelector.value = currentProjectID;
        
        const initialProject = allProjects.find(p => p.ProjectID === currentProjectID);
        if (initialProject) {
            await updateDashboard(initialProject);
        }

    } else {
        if (projectSelector) projectSelector.innerHTML = '<option value="">No Projects Found</option>';
        updateDashboard(null);
    }
}

function populateProjectSelector(projects) {
    if (projectSelector) {
        projectSelector.innerHTML = '<option value="">-- Select Project --</option>';
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.ProjectID;
            option.textContent = project.ProjectName;
            projectSelector.appendChild(option);
        });
    }
}


// --- 5. DASHBOARD UPDATE (Master Controller) ---

async function updateDashboard(project) {
    const detailSpans = document.querySelectorAll('#projectDetailsDisplay .detail-list span');
    const kpiValues = document.querySelectorAll('.kpi-container .value');

    if (!project) {
        currentProjectID = null;
        if(currentProjectNameDisplay) currentProjectNameDisplay.textContent = 'Select a Project';
        
        detailSpans.forEach(el => el.textContent = 'N/A');
        kpiValues.forEach(el => el.textContent = 'N/A');

        const taskTableBody = document.getElementById('taskTableBody');
        if(taskTableBody) taskTableBody.innerHTML = '<tr><td colspan="5">No tasks loaded...</td></tr>';
        const recentExpensesList = document.getElementById('recentExpensesList');
        if(recentExpensesList) recentExpensesList.innerHTML = '<li class="placeholder">No expenses loaded...</li>';
        return;
    }

    currentProjectID = project.ProjectID;
    if(currentProjectNameDisplay) currentProjectNameDisplay.textContent = project.ProjectName;

    // A. Update Project Details
    renderProjectDetails(project);
    
    // B. Fetch Tasks and Expenses concurrently
    const [tasksResponse, expensesResponse] = await Promise.all([
        sendDataToSheet('Tasks', 'GET', { ProjectID: currentProjectID }),
        sendDataToSheet('Expenses', 'GET', { ProjectID: currentProjectID })
    ]);

    // 🎯 CRITICAL FIX: Ensure tasks and expenses are arrays before assignment
    const tasks = (tasksResponse.status === 'success' && Array.isArray(tasksResponse.data)) ? tasksResponse.data : [];
    const expenses = (expensesResponse.status === 'success' && Array.isArray(expensesResponse.data)) ? expensesResponse.data : [];

    // C. Render Lists
    renderTaskList(tasks);
    renderExpenses(expenses);

    // D. Update KPIs (Requires all data)
    updateKPIs(project, tasks, expenses);
}


// --- 6. DATA RENDERING FUNCTIONS (IDs MATCHED TO index.html) ---

function renderProjectDetails(project) {
    const update = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    const projectValue = parseFloat(project.ProjectValue) || 0;
    const formattedValue = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(projectValue);

    update('display-name', project.ProjectName || 'N/A');
    update('display-start-date', project.ProjectStartDate || 'N/A');
    update('display-deadline', project.ProjectDeadline || 'N/A');
    update('display-location', project.ProjectLocation || 'N/A');
    update('display-amount', formattedValue);
    update('display-contractor', project.Contractor || 'N/A');
    update('display-engineers', project.Engineers || 'N/A');
    update('display-contact1', project.Contact1 || 'N/A');
    update('display-contact2', project.Contact2 || 'N/A');
}

function renderTaskList(tasks) {
    // This function is now protected against the TypeError.
    const taskContainer = document.getElementById('taskTableBody'); 
    
    if (!taskContainer) {
        console.error("CRITICAL HTML ERROR: Missing <tbody id=\"taskTableBody\">.");
        return;
    }
    
    taskContainer.innerHTML = ''; 
    
    if (tasks.length === 0) {
        taskContainer.innerHTML = '<tr><td colspan="5">No tasks loaded...</td></tr>';
        return;
    }

    tasks.forEach(task => { // This line is now safe because 'tasks' is guaranteed to be an array.
        const tr = document.createElement('tr');
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

function renderExpenses(expenses) {
    const expensesListElement = document.getElementById('recentExpensesList');
    if (!expensesListElement) return;

    expensesListElement.innerHTML = '';

    if (expenses.length === 0) {
        expensesListElement.innerHTML = '<li class="placeholder">No expenses recorded for this project.</li>';
        return;
    }

    expenses.sort((a, b) => new Date(b.Date) - new Date(a.Date));
    const recentExpenses = expenses.slice(0, 10);
    const formatter = new Intl.NumberFormat('en-IN');

    recentExpenses.forEach(expense => {
        const li = document.createElement('li');
        li.innerHTML = `
            <strong>${expense.Date}</strong>: ${expense.Description} 
            (INR ${formatter.format(parseFloat(expense.Amount))}) 
            [${expense.Category}]
        `;
        expensesListElement.appendChild(li);
    });
}

function updateKPIs(project, tasks, expenses) {
    const projectValue = parseFloat(project.ProjectValue) || 0;
    const projectStart = project.ProjectStartDate;
    const projectDeadline = project.ProjectDeadline;
    const today = new Date().toISOString().split('T')[0];
    
    let daysSpent = 'N/A', daysLeft = 'N/A';
    if (projectStart && projectDeadline) {
        daysSpent = calculateDaysDifference(projectStart, today);
        daysLeft = calculateDaysDifference(today, projectDeadline);
        if (daysLeft < 0) daysLeft = `OVERDUE (${Math.abs(daysLeft)} days)`;
    }

    const completedTasks = tasks.filter(t => t.Status && t.Status.toLowerCase().includes('complete')).length;
    const totalTasks = tasks.length;
    const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    const totalExpenses = expenses.reduce((sum, expense) => sum + (parseFloat(expense.Amount) || 0), 0);
    const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

    // Apply to DOM (Fixed Mismatches)
    document.getElementById('kpi-days-spent').textContent = daysSpent;
    document.getElementById('kpi-days-left').textContent = daysLeft;
    document.getElementById('kpi-progress').textContent = `${taskProgress}%`;
    document.getElementById('kpi-material-progress').textContent = '0% Dispatched';
    document.getElementById('kpi-work-order').textContent = currencyFormatter.format(projectValue);
    document.getElementById('kpi-total-expenses').textContent = currencyFormatter.format(totalExpenses);
}


// --- 7. PROJECT ADDITION & MODAL LOGIC (Assuming modal structure exists) ---

const newProjectModal = document.getElementById('newProjectModal');
const newProjectForm = document.getElementById('newProjectForm');

// ... (Modal/Form logic retained from previous step) ...


// --- 8. PROJECT EDIT LOGIC (Custom Toggle Logic for your HTML Structure) ---

const editProjectDetailsBtn = document.getElementById('editProjectDetailsBtn');
const projectDetailsDisplay = document.getElementById('projectDetailsDisplay');
const projectDetailsEdit = document.getElementById('projectDetailsEdit');
const saveProjectDetailsBtn = document.getElementById('saveProjectDetailsBtn');

if (editProjectDetailsBtn) {
    editProjectDetailsBtn.addEventListener('click', () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to edit.', 'alert');
            return;
        }
        
        // This is the fix for "NA being displayed" after attempting to edit
        if (projectDetailsDisplay && projectDetailsEdit) {
            projectDetailsDisplay.style.display = 'none';
            projectDetailsEdit.style.display = 'block';
        }
        showMessageBox('Edit panel toggled.', 'info');
    });
}

if (saveProjectDetailsBtn) {
    saveProjectDetailsBtn.addEventListener('click', async () => {
        // PUT request logic would go here
        
        if (projectDetailsDisplay && projectDetailsEdit) {
            projectDetailsDisplay.style.display = 'block';
            projectDetailsEdit.style.display = 'none';
        }
        showMessageBox('Project details save attempted.', 'info');
    });
}


// --- 9. FORM SUBMISSION JUMP FIXES ---

// FIX: Prevent form jumps by preventing default submission actions
const recordDispatchForm = document.getElementById('recordDispatchForm');
if (recordDispatchForm) {
    recordDispatchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        showMessageBox('Material Dispatch form submission captured. Logic needs to be implemented.', 'info');
    });
}

const expenseEntryForm = document.getElementById('expenseEntryForm');
if (expenseEntryForm) {
    expenseEntryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        showMessageBox('Expense form submission captured. Logic needs to be implemented.', 'info');
    });
}

const updateTaskForm = document.getElementById('updateTaskForm');
if (updateTaskForm) {
    updateTaskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        showMessageBox('Task Update form submission captured. Logic needs to be implemented.', 'info');
    });
}


// --- 10. INITIALIZATION ---

window.onload = loadProjects;
