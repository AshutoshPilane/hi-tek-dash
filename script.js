// --- NEW HELPER FUNCTION TO READ COOKIES ---
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}
// -----------------------------------------

// --- AUTHENTICATION CHECK (DEBUG MODE) ---
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
}

const loginCookie = getCookie('isLoggedIn');

if (loginCookie !== 'true') {
    // We have a problem. Show a debug alert.
    alert(`DEBUG: Auth check failed.\nCookie value: ${loginCookie}\n(Expected: 'true')\nRedirecting to login...`);
    
    // Redirect to login.
    window.location.href = '/login.html';
}
// --- End of Auth Check ---



// ==============================================================================
// script.js: FINAL OPERATIONAL VERSION
// ==============================================================================
// Vercel, please update! (v2)
// 🎯 CRITICAL: USING THE LOCAL PROXY PATH (/api)
const SHEET_API_URL = "/api"; 

let currentProjectID = null; 
let allProjects = [];
let currentMaterialsData = []; 
let currentTasksData = []; // Stores the full task data for the selected project
let expensePieChart = null; // Holds the pie chart instance
let budgetBarChart = null; // Holds the bar chart instance

// --- NEW FUNCTION: Replaces alert() with Toastify notifications ---
function showMessageBox(message, type) {
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
    let backgroundColor;
    switch (type) {
        case 'success':
            backgroundColor = "linear-gradient(to right, #00b09b, #96c93d)"; // Green
            break;
        case 'error':
            backgroundColor = "linear-gradient(to right, #ff5f6d, #ffc371)"; // Red/Orange
            break;
        case 'alert':
            backgroundColor = "linear-gradient(to right, #ffc107, #ff9a00)"; // Yellow/Orange
            break;
        default:
            backgroundColor = "#007bff"; // Blue (default)
    }
    Toastify({
        text: message,
        duration: 3000,
        close: true,
        gravity: "top",
        position: "right",
        stopOnFocus: true,
        style: { background: backgroundColor }
    }).showToast();
}

// --- Date Formatting Fix ---
function formatDate(isoDateString) {
    if (!isoDateString) return 'N/A';
    if (isoDateString.length === 10 && isoDateString.includes('-')) {
        return isoDateString;
    }
    try {
        const date = new Date(isoDateString);
        return date.toISOString().split('T')[0];
    } catch (e) {
        return isoDateString;
    }
}

// --- Number Formatting for INR (₹) ---
function formatNumber(num) {
    const number = parseFloat(num) || 0;
    return new Intl.NumberFormat('en-IN', { 
        style: 'decimal', 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
    }).format(number);
}

// --- Spinner Helper Functions ---
function showSpinner(button) {
    button.disabled = true;
    const spinner = document.createElement('span');
    spinner.className = 'btn-spinner';
    button.appendChild(spinner);
}
function hideSpinner(button) {
    button.disabled = false;
    const spinner = button.querySelector('.btn-spinner');
    if (spinner) {
        button.removeChild(spinner);
    }
}
// ------------------------------------------------------------------------------------

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
async function sendDataToSheet(sheetName, method, data = {}) {
    const payload = { sheetName, method, ...data };
    try {
        const response = await fetch(SHEET_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error during API call for ${sheetName}/${method}:`, error);
        return { status: 'error', message: error.message };
    }
}

// --- 3. DATA LOADING AND SELECTION ---
const projectSelector = document.getElementById('projectSelector');
const currentProjectNameDisplay = document.getElementById('currentProjectName');

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

    if (expensePieChart) {
        expensePieChart.destroy();
        expensePieChart = null;
    }
    if (budgetBarChart) {
        budgetBarChart.destroy();
        budgetBarChart = null;
    }
}

async function updateDashboard(projectID) {
    if (!projectID) return resetDashboard();
    const projectData = allProjects.find(p => p.ProjectID === projectID);
    if (!projectData) return resetDashboard();

    currentProjectNameDisplay.textContent = projectData.Name || 'N/A';
    updateProjectDetails(projectData);
    
    const taskResult = await sendDataToSheet('Tasks', 'GET', { ProjectID: projectID });
    if (taskResult.status === 'success') {
        const sortedTasks = taskResult.data.sort((a, b) => {
            const getTaskNum = (taskID) => {
                if (!taskID) return 0;
                const match = taskID.match(/-T(\d+)$/); 
                return match ? parseInt(match[1], 10) : 0;
            };
            const numA = getTaskNum(a.TaskID);
            const numB = getTaskNum(b.TaskID);
            return numA - numB;
        });
        currentTasksData = sortedTasks; 
        renderTasks(currentTasksData);
        calculateTaskKPI(currentTasksData);
    } else {
        console.error('Failed to load tasks:', taskResult.message);
        currentTasksData = [];
        renderTasks([]);
    }

    const materialResult = await sendDataToSheet('Materials', 'GET', { ProjectID: projectID });
    if (materialResult.status === 'success') {
        currentMaterialsData = materialResult.data;
        renderMaterials(currentMaterialsData);
        calculateMaterialKPI(currentMaterialsData);
    } else {
        console.error('Failed to load materials:', materialResult.message);
        currentMaterialsData = [];
        renderMaterials([]);
    }

    const expenseResult = await sendDataToSheet('Expenses', 'GET', { ProjectID: projectID });
    if (expenseResult.status === 'success') {
        renderExpenses(expenseResult.data);
        calculateExpenseKPI(expenseResult.data);
        renderExpenseChart(expenseResult.data);
        renderBudgetChart(projectData, expenseResult.data);
    } else {
        console.error('Failed to load expenses:', expenseResult.message);
        renderExpenses([]);
        if (expensePieChart) expensePieChart.destroy();
        if (budgetBarChart) budgetBarChart.destroy();
        renderExpenseChart([]);
        renderBudgetChart(projectData, []);
    }
}

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
            kpiDaysLeftElement.classList.add('overdue');
        } else {
            kpiDaysLeftElement.textContent = `${daysLeft} days left`;
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
    if (taskSelector) taskSelector.innerHTML = '<option value="">-- Select a Task --</option>'; 
    if (tasks.length === 0) {
        taskTableBody.innerHTML = '<tr><td colspan="5">No tasks found for this project.</td></tr>';
        return;
    }
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
        if (taskSelector) {
            const option = document.createElement('option');
            option.value = task.TaskID;
            option.textContent = `${task.TaskName} (${progressValue}%)`;
            if (!previousTaskComplete) {
                option.disabled = true;
            }
            taskSelector.appendChild(option);
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
            const nearest25 = Math.round(currentProgress / 25) * 25;
            taskProgressDropdown.value = nearest25.toString();
        }
    });
}

const updateTaskForm = document.getElementById('updateTaskForm');
if (updateTaskForm) {
    updateTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = updateTaskForm.querySelector('button[type="submit"]');
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
        showSpinner(submitButton);
        const progressValue = parseFloat(progress) || 0;
        const status = progressValue === 100 ? 'Completed' : (progressValue === 0 ? 'Pending' : 'In Progress');
        const updatedData = {
            ProjectID: currentProjectID,
            TaskID: taskID,
            Progress: progressValue.toString(), 
            DueDate: dueDate,
            Status: status,
        };
        try {
            const result = await sendDataToSheet('Tasks', 'PUT', updatedData);
            if (result.status === 'success') {
                await updateDashboard(currentProjectID);
                showMessageBox(`Task updated successfully!`, 'success');
            } else {
                showMessageBox(`Failed to update task: ${result.message}`, 'error');
            }
        } catch (error) {
            showMessageBox(`An unexpected error occurred: ${error.message}`, 'error');
        } finally {
            hideSpinner(submitButton);
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
        const submitButton = recordDispatchForm.querySelector('button[type="submit"]');
        if (!currentProjectID) {
            showMessageBox('Please select a project first.', 'alert');
            return;
        }
        const materialItemId = document.getElementById('materialItemId').value;
        const newMaterialName = document.getElementById('newMaterialName').value.trim();
        const requiredQuantity = parseFloat(document.getElementById('requiredQuantity').value) || 0;
        const dispatchQuantity = parseFloat(document.getElementById('dispatchQuantity').value) || 0;
        const materialUnit = document.getElementById('materialUnit').value;
        let actionType = newMaterialName ? 'POST' : 'PUT';
        let payload = {};
        if (materialItemId) {
            const existingMaterial = currentMaterialsData.find(m => m.MaterialName === materialItemId);
            if (!existingMaterial) {
                showMessageBox('Error: Existing material not found.', 'error');
                return;
            }
            const currentDispatched = parseFloat(existingMaterial.DispatchedQuantity) || 0;
            const newTotalDispatched = currentDispatched + dispatchQuantity;
            payload = {
                ProjectID: currentProjectID,
                MaterialName: materialItemId,
                DispatchedQuantity: newTotalDispatched.toString()
            };
            actionType = 'PUT';
        } else if (newMaterialName) {
            payload = {
                ProjectID: currentProjectID,
                MaterialName: newMaterialName,
                RequiredQuantity: requiredQuantity,
                DispatchedQuantity: dispatchQuantity,
                Unit: materialUnit
            };
            actionType = 'POST';
        } else {
            showMessageBox('Please select an existing material or enter a new one.', 'alert');
            return;
        }
        showSpinner(submitButton);
        try {
            const result = await sendDataToSheet('Materials', actionType, payload);
            if (result.status === 'success') {
                await updateDashboard(currentProjectID);
                recordDispatchForm.reset();
                showMessageBox(`Material entry recorded successfully!`, 'success');
            } else {
                showMessageBox(`Failed to record material entry: ${result.message}`, 'error');
            }
        } catch (error) {
            showMessageBox(`An unexpected error occurred: ${error.message}`, 'error');
        } finally {
            hideSpinner(submitButton);
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

function renderExpenseChart(expenses) {
    const ctx = document.getElementById('expensePieChart');
    if (!ctx) return;
    const categories = {};
    expenses.forEach(e => {
        const amount = parseFloat(e.Amount) || 0;
        categories[e.Category] = (categories[e.Category] || 0) + amount;
    });
    if (expensePieChart) {
        expensePieChart.destroy();
    }
    expensePieChart = new Chart(ctx.getContext('2d'), {
        type: 'pie',
        data: {
            labels: Object.keys(categories),
            datasets: [{
                data: Object.values(categories),
                backgroundColor: ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6c757d'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'top' } }
        }
    });
}

function renderBudgetChart(project, expenses) {
    const ctx = document.getElementById('budgetBarChart');
    if (!ctx) return;
    const budget = parseFloat(project.Budget) || 0;
    const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.Amount) || 0), 0);
    const remaining = budget - totalExpenses;
    if (budgetBarChart) {
        budgetBarChart.destroy();
    }
    budgetBarChart = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Total Budget', 'Total Expenses', 'Remaining'],
            datasets: [{
                label: 'Amount (INR)',
                data: [budget, totalExpenses, remaining],
                backgroundColor: ['#007bff', '#ffc107', remaining < 0 ? '#dc3545' : '#28a745'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

const expenseEntryForm = document.getElementById('expenseEntryForm');
if (expenseEntryForm) {
    expenseEntryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = expenseEntryForm.querySelector('button[type="submit"]');
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
        if (!newExpenseData.Date || !newExpenseData.Description || newExpenseData.Amount <= 0) {
            showMessageBox('Please fill in all required expense fields.', 'alert');
            return;
        }
        showSpinner(submitButton);
        try {
            const result = await sendDataToSheet('Expenses', 'POST', newExpenseData);
            if (result.status === 'success') {
                await updateDashboard(currentProjectID);
                expenseEntryForm.reset();
                showMessageBox(`Expense of ₹${formatNumber(newExpenseData.Amount)} recorded!`, 'success');
            } else {
                showMessageBox(`Failed to record expense: ${result.message}`, 'error');
            }
        } catch (error) {
            showMessageBox(`An unexpected error occurred: ${error.message}`, 'error');
        } finally {
            hideSpinner(submitButton);
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
        const submitButton = newProjectForm.querySelector('button[type="submit"]');
        const newProjectID = document.getElementById('newProjectID').value.trim();
        if (!newProjectID) {
            showMessageBox('Project ID cannot be empty.', 'alert');
            return;
        }
        showSpinner(submitButton);
        const projectData = {
            ProjectID: newProjectID,
            Name: document.getElementById('newProjectName').value,
            ClientName: document.getElementById('newClientName').value,
            ProjectLocation: document.getElementById('newProjectLocation').value,
            StartDate: document.getElementById('newProjectStartDate').value,
            Deadline: document.getElementById('newProjectDeadline').value,
            Budget: parseFloat(document.getElementById('newProjectValue').value) || 0,
            ProjectType: document.getElementById('newProjectType').value,
            Contractor: document.getElementById('newContractor').value,
            Engineers: document.getElementById('newEngineers').value,
            Contact1: document.getElementById('newContact1').value,
            Contact2: document.getElementById('newContact2').value,
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
        try {
            const projectResult = await sendDataToSheet('Projects', 'POST', projectData);
            if (projectResult.status !== 'success') {
                 showMessageBox(`Failed to create project: ${projectResult.message || 'Unknown error.'}`, 'error');
                 throw new Error("Project creation failed");
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
                showMessageBox(`Project ${projectData.Name} created successfully!`, 'success');
            } else {
                if(newProjectModal) newProjectModal.style.display = 'none';
                if(newProjectForm) newProjectForm.reset();
                currentProjectID = newProjectID; 
                await loadProjects(); 
                showMessageBox(`Project created, but ${failedTasks.length} tasks failed to save.`, 'alert');
            }
        } catch (error) {
            console.error("Error in new project submission:", error);
        } finally {
            hideSpinner(submitButton);
        }
    });
}

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
        showSpinner(saveProjectDetailsBtn); 
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
        try {
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
        } catch (error) {
            showMessageBox(`An unexpected error occurred: ${error.message}`, 'error');
        } finally {
            hideSpinner(saveProjectDetailsBtn);
        }
    });
}

const deleteProjectBtn = document.getElementById('deleteProjectBtn');
if (deleteProjectBtn) {
    deleteProjectBtn.addEventListener('click', async () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to delete.', 'alert');
            return;
        }
        const projectToDeleteName = allProjects.find(p => p.ProjectID === currentProjectID)?.Name || currentProjectID;
        Swal.fire({
            title: `Are you sure you want to delete ${projectToDeleteName}?`,
            text: "This will delete ALL associated tasks, materials, and expenses. This action cannot be undone.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, delete it!'
        }).then(async (result) => {
            if (result.isConfirmed) {
                const deletePayload = { ProjectID: currentProjectID };
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
                    currentProjectID = null;
                    await loadProjects();
                    showMessageBox(`Project ${projectToDeleteName} was successfully deleted.`, 'success');
                } catch (error) {
                    showMessageBox(`Failed to delete project: ${error.message}`, 'error');
                }
            }
        });
    });
}

// --- 9. INITIALIZATION ---
window.onload = loadProjects;

// --- LOGOUT BUTTON LOGIC (MODIFIED TO USE COOKIES) ---
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        // Delete the cookie by setting its max-age to 0
        document.cookie = "isLoggedIn=; path=/; max-age=0"; 
        window.location.href = '/login.html'; // Go back to login page
    });
}
// ---------------------------

