// =============================================================================
// script.js: FINAL ROBUST VERSION (Apps Script Payload Fix)
// =============================================================================

const SHEET_API_URL = "/api"; 
let currentProjectID = null; 
let allProjects = [];
let editingProjectID = null; // Variable to safely hold the ID during editing

// --- 1. UTILITY FUNCTIONS ---

function showMessageBox(message, type) {
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
}

async function sendDataToSheet(sheetName, method, data = {}) {
    let payload = { 
        sheetName: sheetName, 
        method: method 
    };

    // 🎯 CRITICAL FIX: Flatten the data payload for PUT/POST/DELETE
    // The Apps Script is typically configured to expect fields like ProjectID 
    // at the top level of the JSON object, not nested under a 'data' key.
    if (['POST', 'PUT', 'DELETE'].includes(method) || method.includes('BATCH')) {
        payload = { ...payload, ...data }; // Combines sheetName, method, and all data fields
    } else {
        payload = { ...payload, ...data };
    }
    
    try {
        const response = await fetch(SHEET_API_URL, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const text = await response.text();
        return JSON.parse(text);

    } catch (error) {
        console.error(`API Error on ${method} ${sheetName}:`, error);
        return { status: 'error', message: error.message };
    }
}

function calculateDaysDifference(startDateString, endDateString) {
    const start = new Date(startDateString);
    const end = new Date(endDateString);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}


// --- 2. PROJECT LOADING AND SELECTION ---

const projectSelector = document.getElementById('projectSelector');
const currentProjectNameDisplay = document.getElementById('currentProjectName');

if (projectSelector) {
    projectSelector.addEventListener('change', async (e) => {
        currentProjectID = e.target.value;
        const selectedProject = allProjects.find(p => p.ProjectID === currentProjectID);
        await updateDashboard(selectedProject || null);
    });
}

async function loadProjects() {
    allProjects = [];
    if (projectSelector) projectSelector.innerHTML = '<option value="">Loading Projects...</option>';
    
    const response = await sendDataToSheet('Projects', 'GET', {});

    if (response.status === 'success' && Array.isArray(response.data) && response.data.length > 0) {
        allProjects = response.data;
        populateProjectSelector(allProjects);
        
        const targetID = document.getElementById('projectSelector').value || allProjects[0].ProjectID;
        currentProjectID = targetID;
        if (projectSelector) projectSelector.value = currentProjectID;
        
        const initialProject = allProjects.find(p => p.ProjectID === currentProjectID);
        await updateDashboard(initialProject);
    } else {
        if (projectSelector) projectSelector.innerHTML = '<option value="">No Projects Found</option>';
        await updateDashboard(null);
    }
}

function populateProjectSelector(projects) {
    if (projectSelector) {
        projectSelector.innerHTML = '<option value="">-- Select Project --</option>';
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.ProjectID;
            option.textContent = project.ProjectName || project.Name;
            projectSelector.appendChild(option);
        });
    }
}


// --- 3. DASHBOARD UPDATE (Master Controller) ---

async function updateDashboard(project) {
    if (!project) {
        currentProjectID = null;
        if(currentProjectNameDisplay) currentProjectNameDisplay.textContent = 'Select a Project';
        renderProjectDetails(null);
        updateKPIs(null, [], []);
        renderTaskList([]);
        renderExpenses([]);
        return;
    }

    currentProjectID = project.ProjectID;
    if(currentProjectNameDisplay) currentProjectNameDisplay.textContent = project.ProjectName;

    renderProjectDetails(project);
    
    const [tasksResponse, expensesResponse] = await Promise.all([
        sendDataToSheet('Tasks', 'GET', { ProjectID: currentProjectID }),
        sendDataToSheet('Expenses', 'GET', { ProjectID: currentProjectID })
    ]);

    const tasks = (tasksResponse.status === 'success' && Array.isArray(tasksResponse.data)) ? tasksResponse.data : [];
    const expenses = (expensesResponse.status === 'success' && Array.isArray(expensesResponse.data)) ? expensesResponse.data : [];

    renderTaskList(tasks);
    renderExpenses(expenses);
    updateKPIs(project, tasks, expenses);
    loadEditForm(project); 
}


// --- 4. DATA RENDERING FUNCTIONS (Omitted for brevity) ---

function renderProjectDetails(project) {
    const update = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    
    if (!project) {
        ['display-name', 'display-start-date', 'display-deadline', 'display-location', 'display-amount', 'display-contractor', 'display-engineers', 'display-contact1', 'display-contact2'].forEach(id => update(id, 'N/A'));
        return;
    }

    const projectValue = parseFloat(project.ProjectValue || 0);
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
    const taskContainer = document.getElementById('taskTableBody'); 
    if (!taskContainer) return;
    taskContainer.innerHTML = ''; 
    
    if (tasks.length === 0) {
        taskContainer.innerHTML = '<tr><td colspan="5">No tasks loaded...</td></tr>';
        return;
    }

    tasks.forEach(task => { 
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
    const update = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    
    if (!project) {
        ['kpi-days-spent', 'kpi-days-left', 'kpi-progress', 'kpi-material-progress', 'kpi-work-order', 'kpi-total-expenses'].forEach(id => update(id, 'N/A'));
        return;
    }
    
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

    update('kpi-days-spent', daysSpent);
    update('kpi-days-left', daysLeft);
    update('kpi-progress', `${taskProgress}%`);
    update('kpi-material-progress', '0% Dispatched');
    update('kpi-work-order', currencyFormatter.format(projectValue));
    update('kpi-total-expenses', currencyFormatter.format(totalExpenses));
}


// --- 5. PROJECT EDIT & DELETE LOGIC ---

const projectDetailsDisplay = document.getElementById('projectDetailsDisplay');
const projectDetailsEdit = document.getElementById('projectDetailsEdit');
const editProjectDetailsBtn = document.getElementById('editProjectDetailsBtn');
const saveProjectDetailsBtn = document.getElementById('saveProjectDetailsBtn');
const deleteProjectBtn = document.getElementById('deleteProjectBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');


function loadEditForm(project) {
    if (!project) return;
    
    const setInputValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    };

    // Use the explicit element IDs from the final index.html
    setInputValue('editProjectID', project.ProjectID || currentProjectID || ''); 
    
    setInputValue('editProjectName', project.ProjectName || project.Name || '');
    setInputValue('editClientName', project.ClientName || ''); 
    setInputValue('editProjectLocation', project.ProjectLocation || '');
    setInputValue('editProjectStartDate', project.ProjectStartDate || '');
    setInputValue('editProjectDeadline', project.ProjectDeadline || '');
    setInputValue('editProjectValue', parseFloat(project.ProjectValue || 0));
    setInputValue('editProjectType', project.ProjectType || '');
    
    // 🎯 Use the new IDs that match the updated index.html
    setInputValue('editContractor', project.Contractor || '');
    setInputValue('editEngineers', project.Engineers || '');
    setInputValue('editContact1', project.Contact1 || '');
    setInputValue('editContact2', project.Contact2 || '');
}


// --- EDIT BUTTON: TOGGLE DISPLAY (ID ISOLATION) ---
if (editProjectDetailsBtn && projectDetailsDisplay && projectDetailsEdit) {
    editProjectDetailsBtn.addEventListener('click', () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to edit.', 'alert');
            return;
        }
        const project = allProjects.find(p => p.ProjectID === currentProjectID);
        
        // 🎯 CRITICAL FIX 1: Capture the ID into the safe variable and lock the UI
        editingProjectID = currentProjectID; 
        if (projectSelector) projectSelector.disabled = true;

        loadEditForm(project);
        
        console.log("DEBUG 1 (Edit Click): ID set to hidden input: " + document.getElementById('editProjectID').value);
        
        projectDetailsDisplay.style.display = 'none';
        projectDetailsEdit.style.display = 'block';
    });
}

// --- CANCEL BUTTON: TOGGLE BACK TO VIEW MODE ---
if (cancelEditBtn && projectDetailsDisplay && projectDetailsEdit) {
    cancelEditBtn.addEventListener('click', () => {
        projectDetailsDisplay.style.display = 'block';
        projectDetailsEdit.style.display = 'none';
        
        // 🎯 CRITICAL FIX 3: Re-enable dropdown and clear safe ID
        if (projectSelector) projectSelector.disabled = false;
        editingProjectID = null; 
        
        showMessageBox('Project details edit cancelled.', 'info');
    });
}


// --- SAVE BUTTON: IMPLEMENT PUT LOGIC (USE ISOLATED ID) ---
if (saveProjectDetailsBtn && projectDetailsDisplay && projectDetailsEdit) {
    saveProjectDetailsBtn.addEventListener('click', async () => {
        
        // 🎯 CRITICAL FIX 2: Use the isolated editingProjectID
        const projectIDToSave = editingProjectID;
        
        console.log("DEBUG 2 (Save Click): ID being sent to PUT: " + projectIDToSave);

        // Define a function for cleanup to avoid repetition
        const cleanup = () => {
            projectDetailsDisplay.style.display = 'block';
            projectDetailsEdit.style.display = 'none';
            if (projectSelector) projectSelector.disabled = false; // Re-enable dropdown
            editingProjectID = null; // Clear safe ID
        };
        
        if (!projectIDToSave) {
            showMessageBox('CRITICAL ERROR: Project ID is missing. Cannot save.', 'error');
            cleanup();
            return;
        }

        const updatedData = {
            ProjectID: projectIDToSave, // Guaranteed to be correct
            ProjectName: document.getElementById('editProjectName').value,
            ClientName: document.getElementById('editClientName').value,
            ProjectLocation: document.getElementById('editProjectLocation').value,
            ProjectStartDate: document.getElementById('editProjectStartDate').value,
            ProjectDeadline: document.getElementById('editProjectDeadline').value,
            ProjectValue: parseFloat(document.getElementById('editProjectValue').value) || 0,
            ProjectType: document.getElementById('editProjectType').value,
            
            // 🎯 Use the new IDs that match the updated index.html
            Contractor: document.getElementById('editContractor').value,
            Engineers: document.getElementById('editEngineers').value,
            Contact1: document.getElementById('editContact1').value,
            Contact2: document.getElementById('editContact2').value,
        };
        
        const result = await sendDataToSheet('Projects', 'PUT', updatedData);

        if (result.status === 'success') {
            cleanup();
            await loadProjects(); 
            // Select the newly updated project
            if (projectSelector) projectSelector.value = projectIDToSave;
            
            // Wait for dashboard update to finish
            const updatedProject = allProjects.find(p => p.ProjectID === projectIDToSave);
            await updateDashboard(updatedProject); 

            showMessageBox(`Project ${updatedData.ProjectName} updated successfully!`, 'success');
        } else {
            cleanup(); // Ensure cleanup happens even on failure
            showMessageBox(`Failed to update project: ${result.message}`, 'error');
        }
    });
}

// --- DELETE BUTTON: IMPLEMENT DELETE LOGIC (Omitted for brevity) ---
if (deleteProjectBtn) {
    deleteProjectBtn.addEventListener('click', async () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to delete.', 'alert');
            return;
        }
        
        const projectName = allProjects.find(p => p.ProjectID === currentProjectID)?.ProjectName || currentProjectID;
        
        if (confirm(`Are you sure you want to permanently delete project ${projectName}? This action cannot be undone.`)) {
            const result = await sendDataToSheet('Projects', 'DELETE', { ProjectID: currentProjectID });
            
            if (result.status === 'success') {
                showMessageBox(`Project ${projectName} deleted successfully.`, 'success');
                currentProjectID = null; 
                await loadProjects(); 
            } else {
                showMessageBox(`Failed to delete project: ${result.message}`, 'error');
            }
        }
    });
}


// --- 6. FORM SUBMISSION JUMP FIXES (Omitted for brevity) ---

document.getElementById('recordDispatchForm')?.addEventListener('submit', (e) => { e.preventDefault(); showMessageBox('Material Dispatch captured. (POST logic required)', 'info'); });
document.getElementById('expenseEntryForm')?.addEventListener('submit', (e) => { e.preventDefault(); showMessageBox('Expense captured. (POST logic required)', 'info'); });
document.getElementById('updateTaskForm')?.addEventListener('submit', (e) => { e.preventDefault(); showMessageBox('Task Update captured. (PUT logic required)', 'info'); });


// --- 7. INITIALIZATION ---

window.onload = loadProjects;
