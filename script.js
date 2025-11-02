// ==============================================================================
// script.js: FINAL VERSION (Vercel Redirect Fix)
// ==============================================================================

// 🎯 CRITICAL: This is the relative path that Vercel will redirect to your Apps Script URL.
const SHEET_API_URL = "/api"; 

let currentProjectID = null; 
let allProjects = [];

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
    { Name: '13. Dispatch', Responsible: 'Logistics Manager' },
    { Name: '14. Payment Follow-Up - 1st Call', Responsible: 'Accounts Manager' },
    { Name: '15. Installation', Responsible: 'Installation Team Lead/Site Engineer' },
    { Name: '16. Inspection', Responsible: 'Quality Inspector' },
    { Name: '17. Payment Follow-Up - 2nd Call', Responsible: 'Accounts Manager' },
    { Name: '18. Final Handover', Responsible: 'Project Manager/Site Engineer' },
    { Name: '19. Final Payment Follow-Up', Responsible: 'Accounts Manager' },
    { Name: '20. Closing The Deal', Responsible: 'Sales/Business Development Team' },
    { Name: '21. System Clean Up', Responsible: 'Project Manager' },
    { Name: '22. Documentation & Filing', Responsible: 'Admin/Project Coordinator' },
    { Name: '23. Feedback Collection', Responsible: 'Project Manager' }
];

// --- 2. API UTILITY FUNCTIONS (SheetDB Format) ---

/**
 * Fetches data from a specified sheet (GET request).
 */
const fetchDataFromSheet = async (sheetName) => {
    // FIX: Add a unique timestamp to the URL to prevent caching (cache-buster).
    const cacheBuster = new Date().getTime();
    const url = `${SHEET_API_URL}?sheet=${sheetName}&cache=${cacheBuster}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        return data; 
    } catch (error) {
        console.error(`Fetch Error on ${sheetName}:`, error);
        document.getElementById('currentProjectName').textContent = 'API Error! Check Console.';
        return [];
    }
};

/**
 * Sends data to a specified sheet (POST/PUT/DELETE request) using SheetDB structure.
 */
const sendDataToSheet = async (sheetName, method, payload) => {
    const url = `${SHEET_API_URL}?sheet=${sheetName}`;
    
    const wrappedPayload = method === 'POST' || method === 'PUT' ? { sheet: sheetName, data: payload } : null;

    try {
        const response = await fetch(url, {
            method: method,
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: wrappedPayload ? JSON.stringify(wrappedPayload) : null
        });

        const result = await response.json();
        
        if (!response.ok) {
            console.error('API Response Error:', result);
            throw new Error(`API Request Failed (${response.status}): ${result.message || 'Unknown error'}`);
        }

        return { status: 'success', message: result };

    } catch (error) {
        console.error(`${method} Error:`, error);
        return { status: 'error', message: error.message };
    }
};

// --- DATE UTILITY FUNCTIONS (Fix for Sheet Date Serial Numbers) ---
/**
 * Converts a Google Sheets serial date number (e.g., 45963) to a YYYY-MM-DD string.
 */
const serialDateToISO = (serial) => {
    const numSerial = Number(serial);
    if (typeof numSerial !== 'number' || numSerial < 1 || isNaN(numSerial)) return '';
    
    // Excel/Sheets date epoch starts at Dec 30, 1899.
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const milliseconds = numSerial * 24 * 60 * 60 * 1000;
    const date = new Date(excelEpoch.getTime() + milliseconds);
    
    return date.toISOString().split('T')[0]; 
};

/**
 * Converts a date (either ISO or serial number) to DD-MM-YYYY string for display.
 */
const formatDisplayDate = (dateValue) => {
    if (!dateValue) return 'N/A';
    
    let isoDate = String(dateValue);
    
    if (isoDate.match(/^\d+$/)) {
        isoDate = serialDateToISO(Number(isoDate));
    }
    
    const parts = isoDate.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY
    }
    return dateValue;
};

/**
 * Creates a UTC-based Date object from an ISO string (YYYY-MM-DD) for reliable comparison.
 * FIX for Issue 1: Prevents local timezone offsets from causing +/- 1 day errors.
 */
const safeDate = (isoDate) => {
    if (!isoDate || isoDate.length !== 10) return null;
    const parts = isoDate.split('-');
    // Month is 0-indexed (0=Jan, 11=Dec)
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
};

// --- 3. PROJECT SELECTION AND DISPLAY ---

const projectSelector = document.getElementById('projectSelector');
const currentProjectNameElement = document.getElementById('currentProjectName');
const projectDetailsDisplay = document.getElementById('projectDetailsDisplay'); 
const projectDetailsEdit = document.getElementById('projectDetailsEdit');     

const loadProjects = async () => {
    projectSelector.innerHTML = '<option value="">-- Select Project --</option>';
    currentProjectID = null;
    allProjects = [];
    
    clearDashboard();
    currentProjectNameElement.textContent = 'Select a Project';

    if (projectDetailsDisplay) projectDetailsDisplay.style.display = 'block';
    if (projectDetailsEdit) projectDetailsEdit.style.display = 'none';

    try {
        const projectsData = await fetchDataFromSheet('Projects');
        if (projectsData && projectsData.length > 0) {
            allProjects = projectsData.filter(p => p.ProjectID); 

            allProjects.forEach(project => {
                const option = document.createElement('option');
                option.value = String(project.ProjectID).trim(); 
                option.textContent = `${project.Name} (${project.ProjectID})`;
                projectSelector.appendChild(option);
            });

            if (allProjects.length > 0) {
                const firstProjectId = String(allProjects[0].ProjectID).trim();
                projectSelector.value = firstProjectId;
                handleProjectSelection(firstProjectId);
            }
        } else {
            currentProjectNameElement.textContent = 'No Projects Found';
        }
    } catch (error) {
        console.error("Error loading projects:", error);
        currentProjectNameElement.textContent = 'Error Loading Projects';
    }
};

const clearDashboard = () => {
    const idsToClear = [
        'kpi-days-spent', 'kpi-days-left', 'kpi-progress', 'kpi-material-progress', 
        'kpi-work-order', 'kpi-total-expenses',
        'display-name', 'display-start-date', 'display-deadline', 
        'display-location', 'display-amount', 'display-contractor', 
        'display-engineers', 'display-contact1', 'display-contact2'
    ];

    idsToClear.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = (id.includes('kpi-work-order') || id.includes('kpi-total-expenses') || id.includes('display-amount')) ? '₹ 0' : 'N/A';
            if (id.includes('kpi-progress') || id.includes('kpi-material-progress')) {
                 element.textContent = '0%';
            }
        }
    });
    
    document.getElementById('taskTableBody').innerHTML = '<tr><td colspan="5">Select a project to view tasks...</td></tr>';
    document.getElementById('materialTableBody').innerHTML = '<tr><td colspan="5">Select a project to view materials...</td></tr>';
    document.getElementById('recentExpensesList').innerHTML = '<li class="placeholder">Select a project to view expenses...</li>';
};

const handleProjectSelection = (projectID) => {
    currentProjectID = projectID;
    
    if (projectDetailsDisplay) projectDetailsDisplay.style.display = 'block';
    if (projectDetailsEdit) projectDetailsEdit.style.display = 'none';

    if (!projectID) {
        clearDashboard();
        currentProjectNameElement.textContent = 'Select a Project';
        return;
    }

    const selectedProject = allProjects.find(p => String(p.ProjectID).trim() === String(projectID).trim());

    if (selectedProject) {
        currentProjectNameElement.textContent = selectedProject.Name;
        updateDashboard(selectedProject);
        loadTasks(projectID);
        loadExpenses(projectID);
        loadMaterials(projectID); // NEW: Load Materials
        loadTasksForDropdown(projectID); // NEW: Load tasks for update panel
    } else {
        clearDashboard();
        currentProjectNameElement.textContent = 'Project Not Found';
    }
};

projectSelector.addEventListener('change', (e) => {
    handleProjectSelection(e.target.value);
});


// --- 4. DASHBOARD UPDATES AND CALCULATION (Updated for Date Formatting) ---

const updateDashboard = (project) => {
    // 1. Convert serial dates to ISO strings for internal use (if they are serial numbers)
    const startDateRaw = project.StartDate;
    const deadlineRaw = project.Deadline;
    
    const startDateISO = startDateRaw ? serialDateToISO(Number(startDateRaw)) : '';
    const deadlineISO = deadlineRaw ? serialDateToISO(Number(deadlineRaw)) : '';
    
    // 1. Update Project Details
    document.getElementById('display-name').textContent = project.Name || 'N/A';
    
    // Apply date formatting for display (DD-MM-YYYY)
    document.getElementById('display-start-date').textContent = formatDisplayDate(startDateRaw);
    document.getElementById('display-deadline').textContent = formatDisplayDate(deadlineRaw);
    
    document.getElementById('display-location').textContent = project.Location || 'N/A';
    document.getElementById('display-amount').textContent = `₹${(parseFloat(project.Amount) || 0).toLocaleString('en-IN')}`;
    document.getElementById('display-contractor').textContent = project.Contractor || 'N/A';
    document.getElementById('display-engineers').textContent = project.Engineers || 'N/A';
    document.getElementById('display-contact1').textContent = project.Contact1 || 'N/A';
    document.getElementById('display-contact2').textContent = project.Contact2 || 'N/A';
    
    // 2. Work Order KPI (Project Amount)
    document.getElementById('kpi-work-order').textContent = `₹${(parseFloat(project.Amount) || 0).toLocaleString('en-IN')}`;

    // 3. Time Calculations (FIX for Issue 1)
    const startDate = startDateISO ? safeDate(startDateISO) : null;
    const deadline = deadlineISO ? safeDate(deadlineISO) : null;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Use UTC for today's date comparison

    const diffInDays = (date1, date2) => {
        if (!date1 || !date2 || isNaN(date1.getTime()) || isNaN(date2.getTime())) return NaN;
        const diffTime = Math.abs(date2.getTime() - date1.getTime()); 
        return Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    };

    // Days Spent (Count full days elapsed)
    const kpiDaysSpentElement = document.getElementById('kpi-days-spent');
    if (startDate && kpiDaysSpentElement) {
        const daysSpent = diffInDays(startDate, today);
        kpiDaysSpentElement.textContent = `${daysSpent > 0 ? daysSpent : 0} days`;
    } else if (kpiDaysSpentElement) {
         kpiDaysSpentElement.textContent = 'N/A';
    }

    // Days Left (Count full days remaining)
    const kpiDaysLeftElement = document.getElementById('kpi-days-left');
    if (deadline && kpiDaysLeftElement) {
        const daysToDeadline = diffInDays(today, deadline); 
        if (today.getTime() <= deadline.getTime()) {
            kpiDaysLeftElement.textContent = `${daysToDeadline > 0 ? daysToDeadline : 0} days`;
        } else {
            // Days overdue
            const daysOverdue = diffInDays(deadline, today); 
            kpiDaysLeftElement.textContent = `${daysOverdue} days (OVERDUE)`;
        }
    } else if (kpiDaysLeftElement) {
         kpiDaysLeftElement.textContent = 'No Deadline';
    }
    
    // NOTE: Progress KPIs (Task/Material) are updated in their respective load functions.
};

// --- 5. TASK MANAGEMENT (Display) ---
// (Remains the same as before)

const loadTasks = async (projectID) => {
    const taskTableBody = document.getElementById('taskTableBody');
    taskTableBody.innerHTML = '<tr><td colspan="5">Loading tasks...</td></tr>';
    
    try {
        const allTasks = await fetchDataFromSheet('Tasks');
        const projectTasks = allTasks.filter(t => String(t.ProjectID).trim() === String(projectID).trim());
        
        taskTableBody.innerHTML = ''; 

        if (projectTasks.length === 0) {
            taskTableBody.innerHTML = '<tr><td colspan="5">No tasks found for this project.</td></tr>';
            document.getElementById('kpi-progress').textContent = '0%';
            return;
        }

        let totalProgress = 0;

        projectTasks.forEach(task => {
            const status = String(task.Status || 'Pending').trim().toLowerCase();
            const progress = parseInt(task.Progress || 0, 10);
            
            totalProgress += progress;

            const row = taskTableBody.insertRow();
            row.innerHTML = `
                <td>${task.TaskName || 'N/A'}</td>
                <td>${task.Responsible || 'N/A'}</td>
                <td>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: ${progress}%; background-color: ${progress === 100 ? '#28a745' : '#007bff'}"></div>
                        <span class="progress-text">${progress}%</span>
                    </div>
                </td>
                <td>${task.Due_Date || 'N/A'}</td>
                <td class="status-cell status-${status.replace(' ', '-')}">${task.Status || 'Pending'}</td>
            `;
        });

        const totalTasks = projectTasks.length;
        const totalProgressPercentage = totalTasks > 0 ? Math.round(totalProgress / totalTasks) : 0;
        const kpiProgressElement = document.getElementById('kpi-progress');

        if (kpiProgressElement) {
            kpiProgressElement.textContent = `${totalProgressPercentage}%`;
        }

    } catch (error) {
        console.error("Error loading tasks:", error);
        taskTableBody.innerHTML = '<tr><td colspan="5">Failed to load tasks.</td></tr>';
        document.getElementById('kpi-progress').textContent = 'Error';
    }
};

// --- 6. TASK UPDATE PANEL (FIX for Issue 3) ---

const taskUpdateForm = document.getElementById('updateTaskForm');
const taskToUpdateSelector = document.getElementById('taskToUpdateSelector');
let projectTasksCache = []; // To store tasks for quick lookup and form population

const loadTasksForDropdown = async (projectID) => {
    taskToUpdateSelector.innerHTML = '<option value="">-- Select Task --</option>';
    taskUpdateForm.reset();
    
    try {
        const allTasks = await fetchDataFromSheet('Tasks');
        // Filter and cache tasks only for the current project
        projectTasksCache = allTasks.filter(t => String(t.ProjectID).trim() === String(projectID).trim());

        if (projectTasksCache.length > 0) {
            projectTasksCache.forEach(task => {
                const option = document.createElement('option');
                option.value = task.TaskName; 
                option.textContent = task.TaskName;
                taskToUpdateSelector.appendChild(option);
            });
        }
    } catch (error) {
        console.error("Error loading tasks for dropdown:", error);
    }
};

// Event listener for dropdown change (to load current task data)
if (taskToUpdateSelector) {
    taskToUpdateSelector.addEventListener('change', (e) => {
        const selectedTaskName = e.target.value;
        const task = projectTasksCache.find(t => t.TaskName === selectedTaskName);
        
        if (task) {
            document.getElementById('updateTaskProgress').value = task.Progress || 0;
            document.getElementById('updateTaskStatus').value = task.Status || 'Pending';
        } else {
            taskUpdateForm.reset();
        }
    });
}

// Event listener for form submission (to update task)
if (taskUpdateForm) {
    taskUpdateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const selectedTaskName = taskToUpdateSelector.value;
        const newProgress = document.getElementById('updateTaskProgress').value;
        const newStatus = document.getElementById('updateTaskStatus').value;

        if (!currentProjectID || !selectedTaskName) {
            alert('Please select a project and a task to update.');
            return;
        }

        // Payload for SheetDB PUT (Update)
        const updatePayload = {
            Progress: parseInt(newProgress, 10),
            Status: newStatus,
            LastUpdated: new Date().toISOString().split('T')[0]
        };
        
        // SheetDB PUT (Update) the row where ProjectID and TaskName match
        const url = `${SHEET_API_URL}?sheet=Tasks&ProjectID=${currentProjectID}&TaskName=${encodeURIComponent(selectedTaskName)}`;
        
        try {
            const response = await fetch(url, {
                method: 'PUT',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatePayload) 
            });

            const result = await response.json();
            
            if (response.ok) {
                alert(`Task "${selectedTaskName}" updated successfully!`);
                
                await loadTasks(currentProjectID); // Reload table
                await loadTasksForDropdown(currentProjectID); // Reload dropdown
                
                taskUpdateForm.reset();
            } else {
                console.error('Task Update Failed:', result);
                alert(`Failed to update task. Error: ${result.message || 'Unknown API Error'}`);
            }
        } catch (error) {
            console.error('Fetch Error:', error);
            alert('An error occurred while communicating with the SheetDB API.');
        }
    });
}


// --- 7. EXPENSE MANAGEMENT ---
let totalSpent = 0;

const loadExpenses = async (projectID) => {
    const expensesList = document.getElementById('recentExpensesList');
    expensesList.innerHTML = '<li class="placeholder">Loading expenses...</li>';
    totalSpent = 0;
    
    try {
        const allExpenses = await fetchDataFromSheet('Expenses');
        const projectExpenses = allExpenses.filter(e => String(e.ProjectID).trim() === String(projectID).trim());
        
        expensesList.innerHTML = ''; 

        if (projectExpenses.length === 0) {
            expensesList.innerHTML = '<li class="placeholder">No expenses recorded for this project.</li>';
        }

        const sortedExpenses = projectExpenses.sort((a, b) => new Date(b.Date) - new Date(a.Date));

        sortedExpenses.slice(0, 10).forEach(expense => { 
            const amount = parseFloat(expense.Amount) || 0;
            totalSpent += amount;
            
            const expenseItem = document.createElement('li');
            expenseItem.className = 'expense-item';
            expenseItem.innerHTML = `
                <span class="expense-date">${formatDisplayDate(expense.Date) || 'N/A'}</span>
                <span class="expense-desc">${expense.Description || 'N/A'} (${expense.Category || 'Other'})</span>
                <span class="expense-amount">₹${amount.toLocaleString('en-IN')}</span>
            `;
            expensesList.appendChild(expenseItem);
        });

        document.getElementById('kpi-total-expenses').textContent = `₹${totalSpent.toLocaleString('en-IN')}`;

    } catch (error) {
        console.error("Error loading expenses:", error);
        expensesList.innerHTML = '<li class="placeholder-error">Failed to load expenses.</li>';
        document.getElementById('kpi-total-expenses').textContent = '₹ Error';
    }
};

document.getElementById('expenseEntryForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentProjectID) {
        alert('Please select a project before recording an expense.');
        return;
    }

    const form = e.target;
    const expenseDate = form.elements['expenseDate'].value;
    const expenseDescription = form.elements['expenseDescription'].value;
    const expenseAmount = form.elements['expenseAmount'].value;
    const expenseCategory = form.elements['expenseCategory'].value;
    
    const payload = {
        ProjectID: String(currentProjectID).trim(),
        Date: expenseDate,
        Description: expenseDescription,
        Amount: parseFloat(expenseAmount),
        Category: expenseCategory,
        RecordedBy: 'User Admin' 
    };
    
    const result = await sendDataToSheet('Expenses', 'POST', [payload]);

    if (result.status === 'success') {
        alert('Expense recorded successfully!');
        form.reset();
        await loadExpenses(currentProjectID); 
    } else {
        alert(`Failed to record expense. Error: ${result.message}`);
    }
});


// --- 8. MATERIAL ENTRY & DISPLAY (FIX for Issue 2) ---

/**
 * Loads and displays materials for the current project.
 */
const loadMaterials = async (projectID) => {
    const materialTableBody = document.getElementById('materialTableBody');
    materialTableBody.innerHTML = '<tr><td colspan="5">Loading materials...</td></tr>';
    
    try {
        const allMaterials = await fetchDataFromSheet('Materials');
        const projectMaterials = allMaterials.filter(m => String(m.ProjectID).trim() === String(projectID).trim());
        
        materialTableBody.innerHTML = '';

        if (projectMaterials.length === 0) {
            materialTableBody.innerHTML = '<tr><td colspan="5">No materials recorded for this project.</td></tr>';
            document.getElementById('kpi-material-progress').textContent = '0%';
            return;
        }

        let totalRequired = 0;
        let totalDispatched = 0;

        projectMaterials.forEach(material => {
            // Must parse as float as they may be stored as strings
            const required = parseFloat(material.Required_Qty) || 0;
            const dispatched = parseFloat(material.Dispatched_Qty) || 0;
            const balance = parseFloat(material.Balance_Qty) || (required - dispatched);
            
            totalRequired += required;
            totalDispatched += dispatched;

            const progress = required > 0 ? Math.round((dispatched / required) * 100) : 0;
            const statusColor = progress === 100 ? '#28a745' : (progress > 0 ? '#ffc107' : '#dc3545');

            const row = materialTableBody.insertRow();
            row.innerHTML = `
                <td>${material.Item_Name || 'N/A'}</td>
                <td>${required.toLocaleString('en-IN')} ${material.Unit || ''}</td>
                <td>${dispatched.toLocaleString('en-IN')} ${material.Unit || ''}</td>
                <td>${balance.toLocaleString('en-IN')} ${material.Unit || ''}</td>
                <td>
                    <div class="progress-container">
                        <div class="progress-bar" style="width: ${progress}%; background-color: ${statusColor}"></div>
                        <span class="progress-text">${progress}%</span>
                    </div>
                </td>
            `;
        });

        // Update Material Progress KPI
        const totalProgress = totalRequired > 0 ? Math.round((totalDispatched / totalRequired) * 100) : 0;
        document.getElementById('kpi-material-progress').textContent = `${totalProgress}%`;

    } catch (error) {
        console.error("Error loading materials:", error);
        materialTableBody.innerHTML = '<tr><td colspan="5">Failed to load materials.</td></tr>';
        document.getElementById('kpi-material-progress').textContent = 'Error';
    }
};

document.getElementById('recordDispatchForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!currentProjectID) {
        alert('Please select a project before recording material dispatch.');
        return;
    }

    const form = e.target;
    const materialItemId = form.elements['materialItemId'].value;
    const newMaterialName = form.elements['newMaterialName'].value;
    const requiredQuantity = parseFloat(form.elements['requiredQuantity'].value) || 0;
    const dispatchQuantity = parseFloat(form.elements['dispatchQuantity'].value) || 0;
    const materialUnit = form.elements['materialUnit'].value;

    let payload;
    let url;
    let method;
    let successMessage;
    
    if (materialItemId) {
        // SCENARIO 1: UPDATE EXISTING MATERIAL (PUT)
        method = 'PUT';
        url = `${SHEET_API_URL}?sheet=Materials&ItemID=${materialItemId}`;
        payload = { 
            // FIX: Convert numbers to strings for reliable SheetDB update
            Dispatched_Qty: String(dispatchQuantity), 
            Unit: materialUnit
        };
        successMessage = `Material (ID: ${materialItemId}) updated successfully!`;

    } else if (newMaterialName && materialUnit) {
        // SCENARIO 2: ADD NEW MATERIAL (POST)
        const newItemID = `${currentProjectID}-${newMaterialName.trim().replace(/\s/g, '-')}-${new Date().getTime()}`; 
        method = 'POST';
        url = `${SHEET_API_URL}?sheet=Materials`;
        
        const balanceQty = requiredQuantity - dispatchQuantity;
        
        payload = {
            ProjectID: String(currentProjectID).trim(),
            ItemID: newItemID,
            Item_Name: newMaterialName,
            // FIX for Issue 2: Explicitly convert numbers to strings 
            Required_Qty: String(requiredQuantity),
            Dispatched_Qty: String(dispatchQuantity),
            Balance_Qty: String(balanceQty),
            Unit: materialUnit
        };
        successMessage = `New material "${newMaterialName}" recorded successfully!`;
        
    } else {
        alert('Please either enter a material ID to update OR a name and unit to add a new material.');
        return;
    }

    try {
        const response = await fetch(url, {
            method: method,
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(method === 'POST' ? { data: [payload] } : payload) 
        });

        const result = await response.json();
        
        if (response.ok) {
            alert(successMessage);
            form.reset();
            await loadMaterials(currentProjectID); // Reload the list
        } else {
            console.error('Material API Error:', result);
            alert(`Failed to record material. Error: ${result.message || 'Unknown API Error'}`);
        }
    } catch (error) {
        console.error('Material Fetch Error:', error);
        alert('An error occurred while processing the material request.');
    }
});

// --- 9. PROJECT ADD/DELETE ---

const generateNewID = () => {
    const existingIDs = allProjects.map(p => {
        const id = String(p.ProjectID).trim();
        const match = id.match(/^HT-(\d+)$/i); 
        return match ? parseInt(match[1], 10) : 0;
    });

    const maxID = Math.max(...existingIDs, 0);
    const newNum = maxID + 1;
    return `HT-${String(newNum).padStart(2, '0')}`; 
};


document.getElementById('addProjectBtn').addEventListener('click', async () => {
    const newName = prompt('Enter the name for the new project:');
    if (!newName || newName.trim() === '') return;

    const newID = generateNewID();
    const today = new Date().toISOString().split('T')[0];
    
    const projectPayload = {
        ProjectID: newID,
        Name: newName.trim(),
        StartDate: today,
        Deadline: '', 
        Amount: 0, 
        CreationDate: today
    };

    const tasksPayload = HI_TEK_TASKS_MAP.map(task => ({
        ProjectID: newID,
        TaskName: task.Name,
        Responsible: task.Responsible,
        Status: 'Pending',
        Progress: 0,
        Due_Date: ''
    }));

    const [projectResult, taskResult] = await Promise.all([
        sendDataToSheet('Projects', 'POST', [projectPayload]),
        sendDataToSheet('Tasks', 'POST', tasksPayload)
    ]);
    
    if (projectResult.status === 'success' && taskResult.status === 'success') {
        alert(`Project "${newName}" added successfully with ID ${newID}. All 23 official tasks were loaded.`);
    } else {
        alert(`Failed to add project. Project Status: ${projectResult.status}. Task Status: ${taskResult.status}. Check the console for details.`);
    }
    
    await loadProjects();
});

document.getElementById('deleteProjectBtn').addEventListener('click', async () => {
    if (!currentProjectID) return alert('No project is selected.');
    const currentProject = allProjects.find(p => String(p.ProjectID).trim() === String(currentProjectID).trim());
    
    if (!confirm(`WARNING: Are you sure you want to delete Project "${currentProject.Name}" (${currentProjectID})? This action will DELETE the project record and all associated data (Tasks, Expenses) from the Google Sheet.`)) {
        return; 
    }
    
    const deleteUrls = [
    `${SHEET_API_URL}?sheet=Projects&ProjectID=${currentProjectID}`,
    `${SHEET_API_URL}?sheet=Tasks&ProjectID=${currentProjectID}`,
    `${SHEET_API_URL}?sheet=Expenses&ProjectID=${currentProjectID}`,
    `${SHEET_API_URL}?sheet=Materials&ProjectID=${currentProjectID}`
];

    const results = await Promise.all(deleteUrls.map(url => fetch(url, { method: 'DELETE' })));
    const jsonResults = await Promise.all(results.map(res => {
        if (res.ok) return res.json();
        return { error: `HTTP Status ${res.status}` };
    }));

    const primaryDeleteSuccess = jsonResults[0] && jsonResults[0].deleted; 

    if (primaryDeleteSuccess) {
        alert(`Project ${currentProjectID} deleted successfully, including all associated data!`);
        await loadProjects(); 
    } else {
        console.error('Delete results:', jsonResults);
        alert(`Failed to delete project. Please check the console. Error: ${jsonResults[0].error || 'Unknown error'}`);
    }
});


// --- 10. PROJECT EDIT LOGIC ---

document.getElementById('editProjectDetailsBtn').addEventListener('click', () => {
    if (!currentProjectID) return alert('Please select a project first.');
    const project = allProjects.find(p => String(p.ProjectID).trim() === String(currentProjectID).trim());

    if (!project) return;

    document.getElementById('input-name').value = project.Name || '';
    
    // Convert serial number to YYYY-MM-DD for date input
    document.getElementById('input-start-date').value = project.StartDate ? serialDateToISO(Number(project.StartDate)) : '';
    document.getElementById('input-deadline').value = project.Deadline ? serialDateToISO(Number(project.Deadline)) : '';
    
    document.getElementById('input-location').value = project.Location || '';
    document.getElementById('input-amount').value = parseFloat(project.Amount) || 0;
    document.getElementById('input-contractor').value = project.Contractor || '';
    document.getElementById('input-engineers').value = project.Engineers || '';
    document.getElementById('input-contact1').value = project.Contact1 || '';
    document.getElementById('input-contact2').value = project.Contact2 || '';

    if (projectDetailsDisplay) projectDetailsDisplay.style.display = 'none';
    if (projectDetailsEdit) projectDetailsEdit.style.display = 'block';
});

document.getElementById('saveProjectDetailsBtn').addEventListener('click', async () => {
    const newName = document.getElementById('input-name').value;
    const newStartDate = document.getElementById('input-start-date').value;
    const newDeadline = document.getElementById('input-deadline').value;
    const newLocation = document.getElementById('input-location').value;
    const newAmount = document.getElementById('input-amount').value;
    const newContractor = document.getElementById('input-contractor').value;
    const newEngineers = document.getElementById('input-engineers').value;
    const newContact1 = document.getElementById('input-contact1').value;
    const newContact2 = document.getElementById('input-contact2').value;

    if (!currentProjectID) return;

    const updatePayload = {
        Name: newName,
        StartDate: newStartDate, 
        Deadline: newDeadline,   
        Location: newLocation,
        Amount: parseFloat(newAmount) || 0,
        Contractor: newContractor,
        Engineers: newEngineers,
        Contact1: newContact1,
        Contact2: newContact2
    };
    
    const url = `${SHEET_API_URL}/ProjectID/${currentProjectID}?sheet=Projects`;
    
    try {
        const response = await fetch(url, {
            method: 'PUT',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload) 
        });

        const result = await response.json();
        
        if (response.ok) {
            alert('Project details updated successfully!');
            
            await loadProjects(); 
            handleProjectSelection(currentProjectID);

            if (projectDetailsDisplay) projectDetailsDisplay.style.display = 'block';
            if (projectDetailsEdit) projectDetailsEdit.style.display = 'none';
        } else {
            console.error('Update Failed:', result);
            alert(`Failed to update project. Error: ${result.message || 'Unknown API Error'}`);
        }
    } catch (error) {
        console.error('Fetch Error:', error);
        alert('An error occurred while communicating with the SheetDB API.');
    }
});


// --- 11. INITIALIZATION ---

document.addEventListener('DOMContentLoaded', loadProjects);


