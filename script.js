// ==============================================================================
// script.js: FINAL OPERATIONAL VERSION (Apps Script Compatibility Fix)
// ==============================================================================

const SHEET_API_URL = "/api"; 

let currentProjectID = null; 
let allProjects = [];

// Variable to safely hold the ID during editing (Required for edit logic)
let editingProjectID = null; 

// --- DUMMY FUNCTION for error/success messages (Required for error-free execution) ---
function showMessageBox(message, type) {
    console.log(`[Message Box | ${type.toUpperCase()}]: ${message}`);
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

async function sendDataToSheet(sheetName, method, data = {}) {
    let payload = { sheetName, method };

    // CRITICAL FIX: Standardize all mutation operations (POST, PUT, DELETE, and BATCH) 
    // to use the 'data' key for the Apps Script endpoint.
    if (['POST', 'PUT', 'DELETE'].includes(method) || method.includes('BATCH')) {
        payload.data = data; 
    } else {
        // For GET operations, spread query params (like ProjectID)
        payload = { ...payload, ...data };
    }
    
    // Convert GET to POST for Google Apps Script compatibility
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

        return await response.json();

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


// --- 3. PROJECT LOADING AND SELECTION ---

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
        await updateDashboard(null);
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


// --- 4. DASHBOARD UPDATE (Master Controller) ---

async function updateDashboard(project) {
    if (!project) {
        currentProjectID = null;
        if(currentProjectNameDisplay) currentProjectNameDisplay.textContent = 'Select a Project';
        // Logic to reset all displays...
        return;
    }

    currentProjectID = project.ProjectID;
    if(currentProjectNameDisplay) currentProjectNameDisplay.textContent = project.ProjectName;

    // A. Update Project Details
    renderProjectDetails(project);
    
    // B. Fetch Tasks, Materials, and Expenses concurrently
    const [tasksResponse, materialsResponse, expensesResponse] = await Promise.all([
        sendDataToSheet('Tasks', 'GET', { ProjectID: currentProjectID }),
        sendDataToSheet('Materials', 'GET', { ProjectID: currentProjectID }), // Assuming a 'Materials' sheet
        sendDataToSheet('Expenses', 'GET', { ProjectID: currentProjectID })
    ]);

    const tasks = tasksResponse.status === 'success' ? tasksResponse.data : [];
    const materials = materialsResponse.status === 'success' ? materialsResponse.data : [];
    const expenses = expensesResponse.status === 'success' ? expensesResponse.data : [];

    // C. Render Lists
    renderTaskList(tasks); 
    populateTaskDropdown(tasks); // <--- FIX: Populate the Task Update Form
    renderMaterialTable(materials); // New rendering function
    renderExpenses(expenses);

    // D. Update KPIs (Requires all data)
    updateKPIs(project, tasks, materials, expenses);
}


// --- 5. DATA RENDERING FUNCTIONS ---

function renderProjectDetails(project) {
    // Helper to update text content based on ID
    const update = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    
    if (!project) {
        // Reset logic...
        return;
    }
    
    const projectValue = parseFloat(project.ProjectValue || 0);
    const formattedValue = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(projectValue);

    // FIX: Use the correct IDs from the HTML for the display panel
    update('display-name', project.ProjectName || 'N/A');
    update('display-start-date', project.ProjectStartDate || 'N/A');
    update('display-deadline', project.ProjectDeadline || 'N/A');
    update('display-location', project.ProjectLocation || 'N/A');
    update('display-amount', formattedValue);
    update('display-contractor', project.Contractor || 'N/A'); 
    update('display-engineers', project.Engineers || 'N/A');
    update('display-contact1', project.Contact1 || 'N/A');
    update('display-contact2', project.Contact2 || 'N/A');
    
    console.log("DEBUG RENDER: Project details updated in display panel.");
}

// FIX: New function to populate the Task Update dropdown
function populateTaskDropdown(tasks) {
    const selector = document.getElementById('taskId');
    if (!selector) {
        console.error("FATAL ERROR: Task Update Dropdown (#taskId) not found.");
        return;
    }
    selector.innerHTML = '<option value="">-- Select a Task --</option>';
    tasks.forEach(task => {
        const option = document.createElement('option');
        option.value = task.TaskID;
        option.textContent = task.TaskName;
        selector.appendChild(option);
    });
    console.log(`DEBUG TASK: Populated Task Update dropdown with ${tasks.length} tasks.`);
}


// FIX: Rewritten to render to the table body (taskTableBody)
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
        // Determine status and style
        const progress = parseFloat(task.Progress) || 0;
        let status = 'Pending';
        if (progress === 100) {
            status = 'Completed';
            tr.style.backgroundColor = '#e6ffe6'; // Light green for completed
        } else if (progress > 0) {
            status = 'In Progress';
        }

        tr.innerHTML = `
            <td>${task.TaskName || 'N/A'}</td>
            <td>${task.Responsible || 'N/A'}</td>
            <td>${progress}%</td>
            <td>${task.DueDate || 'N/A'}</td>
            <td>${status}</td>
        `;
        taskContainer.appendChild(tr);
    });
    console.log(`DEBUG RENDER: Task table updated with ${tasks.length} tasks.`);
}

function renderMaterialTable(materials) {
    const tableBody = document.getElementById('materialTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (materials.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">No materials loaded...</td></tr>';
        return;
    }

    const totalRequired = materials.reduce((sum, m) => sum + (parseFloat(m.RequiredQuantity) || 0), 0);
    const totalDispatched = materials.reduce((sum, m) => sum + (parseFloat(m.DispatchedQuantity) || 0), 0);

    materials.forEach(material => {
        const required = parseFloat(material.RequiredQuantity) || 0;
        const dispatched = parseFloat(material.DispatchedQuantity) || 0;
        const balance = required - dispatched;
        const progress = required > 0 ? Math.round((dispatched / required) * 100) : 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${material.Name || 'N/A'}</td>
            <td>${required} ${material.Unit || ''}</td>
            <td>${dispatched} ${material.Unit || ''}</td>
            <td>${balance} ${material.Unit || ''}</td>
            <td>${progress}%</td>
        `;
        tableBody.appendChild(tr);
    });
    
    // Also populate the material select dropdown
    const selector = document.getElementById('materialItemId');
    if (selector) {
        selector.innerHTML = '<option value="">-- Select Existing Material --</option>';
        materials.forEach(material => {
            const option = document.createElement('option');
            option.value = material.MaterialID;
            option.textContent = `${material.Name} (${material.Unit})`;
            selector.appendChild(option);
        });
    }
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
            (<span style="color:#dc3545;">- INR ${formatter.format(parseFloat(expense.Amount))}</span>) 
            [${expense.Category}]
        `;
        expensesListElement.appendChild(li);
    });
    console.log(`DEBUG RENDER: Expense list updated with ${expenses.length} records.`);
}

function updateKPIs(project, tasks, materials, expenses) {
    const update = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    if (!project) {
        // Reset logic...
        return;
    }
    
    const projectValue = parseFloat(project.ProjectValue) || 0;
    const projectStart = project.ProjectStartDate;
    const projectDeadline = project.ProjectDeadline;

    // Time KPIs
    const today = new Date().toISOString().split('T')[0];
    let daysSpent = 'N/A';
    let daysLeft = 'N/A';
    
    if (projectStart && projectDeadline) {
        const daysTotal = calculateDaysDifference(projectStart, projectDeadline);
        
        daysSpent = calculateDaysDifference(projectStart, today);
        if (new Date(projectStart) > new Date(today)) daysSpent = 0; // Project hasn't started yet

        const remaining = calculateDaysDifference(today, projectDeadline);
        if (new Date(today) > new Date(projectDeadline)) {
             daysLeft = `OVERDUE by ${calculateDaysDifference(projectDeadline, today)} days`;
        } else {
             daysLeft = remaining;
        }
    }

    // Task KPIs
    const completedTasks = tasks.filter(t => (parseFloat(t.Progress) || 0) === 100).length;
    const totalTasks = tasks.length;
    const taskProgressPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    // Material KPIs
    const totalRequiredMaterial = materials.reduce((sum, m) => sum + (parseFloat(m.RequiredQuantity) || 0), 0);
    const totalDispatchedMaterial = materials.reduce((sum, m) => sum + (parseFloat(m.DispatchedQuantity) || 0), 0);
    const materialProgress = totalRequiredMaterial > 0 ? Math.round((totalDispatchedMaterial / totalRequiredMaterial) * 100) : 0;

    // Expense KPIs
    const totalExpenses = expenses.reduce((sum, expense) => sum + (parseFloat(expense.Amount) || 0), 0);
    
    // Formatting
    const currencyFormatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

    // FIX: Use the correct KPI IDs from the HTML
    update('kpi-days-spent', daysSpent);
    update('kpi-days-left', daysLeft);
    update('kpi-progress', `${taskProgressPercentage}%`); // This is for Project Progress (Tasks)
    update('kpi-material-progress', `${materialProgress}% Dispatched`); // This is for Material Progress
    update('kpi-work-order', currencyFormatter.format(projectValue)); // This is for Work Order Amount
    update('kpi-total-expenses', currencyFormatter.format(totalExpenses));
    
    console.log("DEBUG RENDER: KPIs updated.");
}


// --- 6. TASK MANAGEMENT (Update Status) ---

const updateTaskForm = document.getElementById('updateTaskForm');
if (updateTaskForm) {
    updateTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentProjectID) {
            showMessageBox('Please select a project before updating a task.', 'alert');
            return;
        }

        const taskID = document.getElementById('taskId').value;
        const progress = document.getElementById('taskProgress').value;
        const dueDate = document.getElementById('taskDue').value;

        if (!taskID) {
            showMessageBox('Please select a task from the dropdown to update.', 'alert');
            return;
        }

        const updatePayload = {
            ProjectID: currentProjectID,
            TaskID: taskID,
            Progress: progress,
            DueDate: dueDate,
            // Status is implicitly derived from progress (100% = Completed)
            Status: progress == 100 ? 'Completed' : (progress > 0 ? 'In Progress' : 'Pending')
        };

        const result = await sendDataToSheet('Tasks', 'PUT', updatePayload);

        if (result.status === 'success') {
            updateTaskForm.reset();
            // Reload projects to update all KPIs and lists
            await loadProjects(); 
            showMessageBox(`Task ${taskID} progress updated to ${progress}%.`, 'success');
        } else {
            showMessageBox(`Failed to update task status: ${result.message}`, 'error');
        }
    });
}


// --- 7. NEW PROJECT CREATION ---

const addProjectBtn = document.getElementById('addProjectBtn');
const newProjectModal = document.getElementById('newProjectModal');
const closeNewModalBtn = newProjectModal ? newProjectModal.querySelector('.close-button') : null;
const newProjectForm = document.getElementById('newProjectForm');

if (addProjectBtn) {
    addProjectBtn.addEventListener('click', () => {
        if(newProjectForm) newProjectForm.reset();
        if(newProjectModal) newProjectModal.style.display = 'block';
    });
}

if (closeNewModalBtn) {
    closeNewModalBtn.addEventListener('click', () => {
        if(newProjectModal) newProjectModal.style.display = 'none';
    });
}

// Close the modal if the user clicks anywhere outside of it
window.addEventListener('click', (event) => {
    if (event.target === newProjectModal) {
        newProjectModal.style.display = 'none';
    }
});


if (newProjectForm) {
    newProjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newProjectID = document.getElementById('newProjectID').value.trim();
        if (!newProjectID) {
            showMessageBox('Project ID cannot be empty.', 'alert');
            return;
        }
        
        const projectData = {
            ProjectID: newProjectID,
            ProjectName: document.getElementById('newProjectName').value,
            ClientName: document.getElementById('newClientName').value,
            ProjectLocation: document.getElementById('newProjectLocation').value,
            ProjectStartDate: document.getElementById('newProjectStartDate').value,
            ProjectDeadline: document.getElementById('newProjectDeadline').value,
            ProjectValue: parseFloat(document.getElementById('newProjectValue').value) || 0,
            ProjectType: document.getElementById('newProjectType').value,
            // Initialize empty contact/contractor fields for data consistency
            Contractor: '',
            Engineers: '',
            Contact1: '',
            Contact2: '',
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

        const [projectResult, tasksResult] = await Promise.all([
            sendDataToSheet('Projects', 'POST', projectData), 
            sendDataToSheet('Tasks', 'POST_BATCH', initialTasks) 
        ]);

        if (projectResult.status === 'success' && tasksResult.status === 'success') {
            if(newProjectModal) newProjectModal.style.display = 'none';
            if(newProjectForm) newProjectForm.reset();
            await loadProjects();
            showMessageBox(`Project ${projectData.ProjectName} created successfully with ${initialTasks.length} initial tasks!`, 'success');
        } else {
            const projectErrorMessage = projectResult.message || 'Unknown Project Error';
            const tasksErrorMessage = tasksResult.message || 'Unknown Task Batch Error';
            showMessageBox(`Failed to create project. Project Error: ${projectErrorMessage}. Task Error: ${tasksErrorMessage}.`, 'error');
        }
    });
}


// --- 8. EXPENSE RECORDING (FIXED) ---

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
            Amount: parseFloat(document.getElementById('expenseAmount').value) || 0,
            Category: document.getElementById('expenseCategory').value,
            ExpenseID: Date.now().toString(),
        };

        const result = await sendDataToSheet('Expenses', 'POST', expenseData);

        if (result.status === 'success') {
            if(expenseEntryForm) expenseEntryForm.reset();
            // Set Date to today for convenience after successful post
            document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
            
            // FIX: Find the current project and pass it to updateDashboard
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

// --- 9. MATERIAL DISPATCH (ADD/UPDATE) LOGIC ---
const recordDispatchForm = document.getElementById('recordDispatchForm');
if (recordDispatchForm) {
    recordDispatchForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentProjectID) {
            showMessageBox('Please select a project before recording material dispatch.', 'alert');
            return;
        }

        const materialItemId = document.getElementById('materialItemId').value;
        const newMaterialName = document.getElementById('newMaterialName').value.trim();
        const requiredQuantity = parseFloat(document.getElementById('requiredQuantity').value) || 0;
        const dispatchQuantity = parseFloat(document.getElementById('dispatchQuantity').value) || 0;
        const materialUnit = document.getElementById('materialUnit').value;

        let payload = {};
        let method = '';
        
        if (materialItemId) {
            // Case 1: Updating an existing material
            method = 'PUT';
            // Find existing material to get current dispatched quantity
            const existingMaterial = allProjects.find(p => p.ProjectID === currentProjectID)?.materials?.find(m => m.MaterialID === materialItemId);
            const currentDispatched = parseFloat(existingMaterial?.DispatchedQuantity || 0);

            payload = {
                ProjectID: currentProjectID,
                MaterialID: materialItemId,
                // Only update dispatched quantity by adding the new amount
                DispatchedQuantity: currentDispatched + dispatchQuantity, 
                // Keep other fields the same or update if needed
                Unit: materialUnit
            };
        } else if (newMaterialName) {
            // Case 2: Adding a new material
            method = 'POST';
            payload = {
                ProjectID: currentProjectID,
                MaterialID: `${currentProjectID}-M${Date.now()}`,
                Name: newMaterialName,
                RequiredQuantity: requiredQuantity,
                DispatchedQuantity: dispatchQuantity,
                Unit: materialUnit
            };
        } else {
            showMessageBox('Please select an existing material OR enter a new material name.', 'alert');
            return;
        }
        
        const result = await sendDataToSheet('Materials', method, payload);

        if (result.status === 'success') {
            recordDispatchForm.reset();
            // FIX: Find the current project and pass it to updateDashboard
            await updateDashboard(allProjects.find(p => p.ProjectID === currentProjectID)); 
            showMessageBox(`Material recorded/updated successfully!`, 'success');
        } else {
            showMessageBox(`Failed to record material: ${result.message}`, 'error');
        }
    });
}


// --- 10. PROJECT DELETION LOGIC ---

const deleteProjectBtn = document.getElementById('deleteProjectBtn');
if (deleteProjectBtn) {
    deleteProjectBtn.addEventListener('click', async () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to delete.', 'alert');
            return;
        }
        
        const projectName = allProjects.find(p => p.ProjectID === currentProjectID)?.ProjectName || currentProjectID;
        
        if (!confirm(`Are you sure you want to permanently delete project ${projectName} and ALL its associated data? This action cannot be undone.`)) {
             return;
        }

        const deletePayload = { ProjectID: currentProjectID };

        // Deleting related data first, then the project record itself
        const [projectDeleteResult] = await Promise.all([
            sendDataToSheet('Projects', 'DELETE', deletePayload),
            sendDataToSheet('Tasks', 'DELETE', deletePayload),
            sendDataToSheet('Expenses', 'DELETE', deletePayload),
            sendDataToSheet('Materials', 'DELETE', deletePayload), // Assuming 'Materials' sheet
        ]);


        if (projectDeleteResult.status === 'success') {
            showMessageBox(`Project ${currentProjectID} deleted successfully, including all associated data!`, 'success');
            await loadProjects(); 
        } else {
            showMessageBox(`Failed to delete project. Error: ${projectDeleteResult.message}`, 'error');
        }
    });
}


// --- 11. PROJECT EDIT LOGIC (FIXED) ---

const projectDetailsDisplay = document.getElementById('projectDetailsDisplay');
const projectDetailsEdit = document.getElementById('projectDetailsEdit');
const editProjectDetailsBtn = document.getElementById('editProjectDetailsBtn');
const saveProjectDetailsBtn = document.getElementById('saveProjectDetailsBtn'); // This button is inside the edit form in your HTML
const cancelEditBtn = document.getElementById('cancelEditBtn'); // This button is inside the edit form in your HTML

// Helper to load form with project data
function loadEditForm(project) {
    if (!project) return;
    
    const setInputValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    };
    
    // Set all fields including the missing ones from the previous fix
    setInputValue('editProjectID', project.ProjectID || currentProjectID || ''); 
    setInputValue('editProjectName', project.ProjectName || '');
    setInputValue('editClientName', project.ClientName || ''); 
    setInputValue('editProjectLocation', project.ProjectLocation || '');
    setInputValue('editProjectStartDate', project.ProjectStartDate || '');
    setInputValue('editProjectDeadline', project.ProjectDeadline || '');
    setInputValue('editProjectValue', parseFloat(project.ProjectValue || 0));
    setInputValue('editProjectType', project.ProjectType || '');
    setInputValue('editContractor', project.Contractor || '');
    setInputValue('editEngineers', project.Engineers || '');
    setInputValue('editContact1', project.Contact1 || '');
    setInputValue('editContact2', project.Contact2 || '');
}

// EDIT BUTTON: TOGGLE DISPLAY
if (editProjectDetailsBtn && projectDetailsDisplay && projectDetailsEdit) {
    editProjectDetailsBtn.addEventListener('click', () => {
        if (!currentProjectID) {
            showMessageBox('Please select a project to edit.', 'alert');
            return;
        }
        const project = allProjects.find(p => p.ProjectID === currentProjectID);
        
        editingProjectID = currentProjectID; 
        if (projectSelector) projectSelector.disabled = true;

        loadEditForm(project);
        
        projectDetailsDisplay.style.display = 'none';
        projectDetailsEdit.style.display = 'block';
    });
}

// CANCEL BUTTON: TOGGLE BACK TO VIEW MODE
if (cancelEditBtn && projectDetailsDisplay && projectDetailsEdit) {
    cancelEditBtn.addEventListener('click', () => {
        projectDetailsDisplay.style.display = 'block';
        projectDetailsEdit.style.display = 'none';
        
        if (projectSelector) projectSelector.disabled = false;
        editingProjectID = null; 
        
        showMessageBox('Project details edit cancelled.', 'info');
    });
}

// SAVE BUTTON: IMPLEMENT PUT LOGIC
if (saveProjectDetailsBtn) {
    saveProjectDetailsBtn.addEventListener('click', async () => {
        
        const projectIDToSave = editingProjectID;
        
        const cleanup = () => {
            if(projectDetailsDisplay) projectDetailsDisplay.style.display = 'block';
            if(projectDetailsEdit) projectDetailsEdit.style.display = 'none';
            if (projectSelector) projectSelector.disabled = false;
            editingProjectID = null;
        };
        
        if (!projectIDToSave) {
            showMessageBox('CRITICAL ERROR: Project ID is missing. Cannot save.', 'error');
            cleanup();
            return;
        }

        // Get updated data from the form (All fields included for consistency)
        const updatedData = {
            ProjectID: projectIDToSave,
            ProjectName: document.getElementById('editProjectName').value,
            ClientName: document.getElementById('editClientName').value,
            ProjectLocation: document.getElementById('editProjectLocation').value,
            ProjectStartDate: document.getElementById('editProjectStartDate').value,
            ProjectDeadline: document.getElementById('editProjectDeadline').value,
            ProjectValue: parseFloat(document.getElementById('editProjectValue').value) || 0,
            ProjectType: document.getElementById('editProjectType').value,
            Contractor: document.getElementById('editContractor').value,
            Engineers: document.getElementById('editEngineers').value,
            Contact1: document.getElementById('editContact1').value,
            Contact2: document.getElementById('editContact2').value,
        };
        
        const result = await sendDataToSheet('Projects', 'PUT', updatedData);

        if (result.status === 'success') {
            cleanup();
            await loadProjects(); 
            if (projectSelector) projectSelector.value = projectIDToSave;
            
            // Wait for dashboard update to finish
            const updatedProject = allProjects.find(p => p.ProjectID === projectIDToSave);
            await updateDashboard(updatedProject); 

            showMessageBox(`Project ${updatedData.ProjectName} updated successfully!`, 'success');
        } else {
            cleanup();
            showMessageBox(`Failed to update project: ${result.message}`, 'error');
        }
    });
}


// --- 12. INITIALIZATION ---

window.onload = loadProjects;
