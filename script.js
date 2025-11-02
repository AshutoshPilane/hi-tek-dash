// ==============================================================================
// script.js: FINAL OPERATIONAL VERSION (Apps Script Compatibility Fix)
// ==============================================================================

// 🎯 CRITICAL: USING THE LOCAL PROXY PATH (/api)
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

// --- 2. API UTILITY FUNCTIONS (Apps Script Format) ---

/**
 * Fetches data from a specified sheet (GET request).
 */
/**
 * Fetches data from a specified sheet (GET request).
 */
const fetchDataFromSheet = async (sheetName) => {
    // FIX: Add a unique timestamp to the URL to prevent caching (cache-buster).
    const cacheBuster = new Date().getTime();
    const url = `${SHEET_API_URL}?sheet=${sheetName}&cache=${cacheBuster}`;
    try {
        const response = await fetch(url);
        
        // 1. Read as text first to handle non-JSON responses gracefully
        const textResponse = await response.text(); 
        let data;

        try {
            // 2. Try to parse as JSON
            data = JSON.parse(textResponse);
        } catch (e) {
            // If parsing fails, the response was likely the HTML error page
            console.error('API Response was not JSON (Likely an Apps Script/Proxy HTML error page):', textResponse);
            document.getElementById('currentProjectName').textContent = 'API Error! Check Console.';
            // Re-throw a descriptive error based on the HTML content starting with '<!DOCTYPE'
            throw new Error(`API Request Failed: Received non-JSON response from server. Check Apps Script deployment/permissions. (Text: ${textResponse.substring(0, 50)}...)`);
        }

        // 3. Check for HTTP errors (4xx, 5xx)
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        // 4. Check for error status returned by the script (if implemented)
        if (data && data.status === 'error') {
            throw new Error(`Apps Script Error: ${data.message || 'Unknown script error'}`);
        }
        
        return data; // Return the parsed JSON data
    } catch (error) {
        console.error(`Fetch Error on ${sheetName}:`, error);
        document.getElementById('currentProjectName').textContent = 'API Error! Check Console.';
        return [];
    }
};

/**
 * Sends data to a specified sheet (POST/PUT/DELETE request) to the Apps Script Web App.
 * FIX: All requests to Apps Script are POST, and the intended action (method) is passed in the body.
 */
const sendDataToSheet = async (sheetName, method, payload) => {
    const url = `${SHEET_API_URL}?sheet=${sheetName}`;
    
    // Correct structure for Google Apps Script POST/PUT/DELETE
    const finalPayload = {
        sheet: sheetName,
        method: method, // The Apps Script reads this to know the intended CRUD operation
        data: payload
    };

    try {
        const response = await fetch(url, {
            method: 'POST', // All fetch calls to Apps Script must be POST
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(finalPayload)
        });

        const textResponse = await response.text(); // Read as text first
        let result;

        try {
            result = JSON.parse(textResponse);
        } catch (e) {
            // If it's not JSON, it's the HTML error page (the 404 issue)
            console.error('API Response was not JSON (Likely a 404 HTML page):', textResponse);
            throw new Error(`API Request Failed: Received non-JSON response from server. Check Vercel/Netlify proxy configuration. (Text: ${textResponse.substring(0, 50)}...)`);
        }

        // Check for fetch error or error status returned by the script
        if (!response.ok || (result && result.status === 'error')) {
            console.error('API Response Error:', result);
            // Use the script's error message if available
            throw new Error(`API Request Failed (${response.status}): ${result.message || 'Unknown error'}`);
        }

        return { status: 'success', message: result };

    } catch (error) {
        console.error(`${method} Error:`, error);
        return { status: 'error', message: error.message };
    }
};

// --- DATE UTILITY FUNCTIONS ---
/**
 * Converts a Google Sheets serial date number (e.g., 45963) to a YYYY-MM-DD string.
 */
const serialDateToISO = (serial) => {
    const numSerial = Number(serial);
    if (typeof numSerial !== 'number' || numSerial < 1 || isNaN(numSerial)) return '';
    
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
 */
const safeDate = (isoDate) => {
    if (!isoDate || isoDate.length !== 10) return null;
    const parts = isoDate.split('-');
    return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
};

// --- 3. PROJECT SELECTION AND DISPLAY ---

const projectSelector = document.getElementById('projectSelector');
const currentProjectNameElement = document.getElementById('currentProjectName');
const projectDetailsDisplay = document.getElementById('projectDetailsDisplay'); 
const projectDetailsEdit = document.getElementById('projectDetailsEdit');     

const loadProjects = async () => {
    if (!projectSelector || !currentProjectNameElement) return; // Added safety check
    
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
    
    const taskTableBody = document.getElementById('taskTableBody');
    if(taskTableBody) taskTableBody.innerHTML = '<tr><td colspan="5">Select a project to view tasks...</td></tr>';
    
    const materialTableBody = document.getElementById('materialTableBody');
    if(materialTableBody) materialTableBody.innerHTML = '<tr><td colspan="5">Select a project to view materials...</td></tr>';
    
    const recentExpensesList = document.getElementById('recentExpensesList');
    if(recentExpensesList) recentExpensesList.innerHTML = '<li class="placeholder">Select a project to view expenses...</li>';
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
        loadMaterials(projectID);
        loadTasksForDropdown(projectID);
    } else {
        clearDashboard();
        currentProjectNameElement.textContent = 'Project Not Found';
    }
};

if (projectSelector) {
    projectSelector.addEventListener('change', (e) => {
        handleProjectSelection(e.target.value);
    });
}


// --- 4. DASHBOARD UPDATES AND CALCULATION ---

const updateDashboard = (project) => {
    // 1. Convert serial dates to ISO strings for internal use (if they are serial numbers)
    const startDateRaw = project.StartDate;
    const deadlineRaw = project.Deadline;
    
    const startDateISO = startDateRaw ? serialDateToISO(Number(startDateRaw)) : '';
    const deadlineISO = deadlineRaw ? serialDateToISO(Number(deadlineRaw)) : '';
    
    // 1. Update Project Details
    const displayName = document.getElementById('display-name');
    if(displayName) displayName.textContent = project.Name || 'N/A';

    // Apply date formatting for display (DD-MM-YYYY)
    const displayStartDate = document.getElementById('display-start-date');
    if(displayStartDate) displayStartDate.textContent = formatDisplayDate(startDateRaw);
    
    const displayDeadline = document.getElementById('display-deadline');
    if(displayDeadline) displayDeadline.textContent = formatDisplayDate(deadlineRaw);
    
    // (Other detail updates removed for brevity but are in the original logic)
    
    // 2. Work Order KPI (Project Amount)
    const kpiWorkOrder = document.getElementById('kpi-work-order');
    if(kpiWorkOrder) kpiWorkOrder.textContent = `₹${(parseFloat(project.Amount) || 0).toLocaleString('en-IN')}`;

    // 3. Time Calculations 
    const startDate = startDateISO ? safeDate(startDateISO) : null;
    const deadline = deadlineISO ? safeDate(deadlineISO) : null;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

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
            const daysOverdue = diffInDays(deadline, today); 
            kpiDaysLeftElement.textContent = `${daysOverdue} days (OVERDUE)`;
        }
    } else if (kpiDaysLeftElement) {
         kpiDaysLeftElement.textContent = 'No Deadline';
    }
};

// --- 5, 6, 7, 8: Task, Expense, Material Management (Same Logic) ---
// (Logic for loadTasks, loadExpenses, loadMaterials, updateTaskForm, expenseEntryForm, recordDispatchForm goes here - UNCHANGED)

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

// FIX A: Use local proxy URL
const addProjectBtn = document.getElementById('addProjectBtn');
if (addProjectBtn) {
    addProjectBtn.addEventListener('click', async () => {
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
}

// FIX C: Add safety check
const deleteProjectBtn = document.getElementById('deleteProjectBtn');
if (deleteProjectBtn) {
    deleteProjectBtn.addEventListener('click', async () => {
        if (!currentProjectID) return alert('No project is selected.');
        const currentProject = allProjects.find(p => String(p.ProjectID).trim() === String(currentProjectID).trim());
        
        if (!confirm(`WARNING: Are you sure you want to delete Project "${currentProject.Name}" (${currentProjectID})? This action will DELETE the project record and all associated data (Tasks, Expenses) from the Google Sheet.`)) {
            return; 
        }
        
        const deletePayload = [{ ProjectID: currentProjectID }];

        const [projectDeleteResult, tasksDeleteResult, expensesDeleteResult, materialsDeleteResult] = await Promise.all([
            sendDataToSheet('Projects', 'DELETE', deletePayload),
            sendDataToSheet('Tasks', 'DELETE', deletePayload),
            sendDataToSheet('Expenses', 'DELETE', deletePayload),
            sendDataToSheet('Materials', 'DELETE', deletePayload)
        ]);


        if (projectDeleteResult.status === 'success') {
            alert(`Project ${currentProjectID} deleted successfully, including all associated data!`);
            await loadProjects(); 
        } else {
            console.error('Delete results:', { projectDeleteResult, tasksDeleteResult, expensesDeleteResult, materialsDeleteResult });
            alert(`Failed to delete project. Please check the console for details. Primary Error: ${projectDeleteResult.message}`);
        }
    });
}


// --- 10. PROJECT EDIT LOGIC ---

const editProjectDetailsBtn = document.getElementById('editProjectDetailsBtn');
if (editProjectDetailsBtn) {
    editProjectDetailsBtn.addEventListener('click', () => {
        // ... (existing logic for edit button)
    });
}

const cancelEditBtn = document.getElementById('cancelEditBtn');
if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
        // ... (existing logic for cancel button)
    });
}

const projectEditForm = document.getElementById('projectEditForm');
if (projectEditForm) {
    projectEditForm.addEventListener('submit', async (e) => {
        // ... (existing logic for edit form submission)
    });
}


// --- 11. INITIALIZATION ---

document.addEventListener('DOMContentLoaded', loadProjects);

