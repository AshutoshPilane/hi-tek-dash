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
// ---------------------------------

const loginForm = document.getElementById('loginForm');
const messageContainer = document.getElementById('message-container');
const continueBtn = document.getElementById('continueBtn');

// --- NEW: Storage Tester ---
// This runs immediately to see if storage is blocked (e.g., Private Browsing)
try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
} catch (e) {
    // Storage is blocked! Show an error and hide the form.
    messageContainer.textContent = 'Error: Your browser is blocking storage. Please try again in a non-private (normal) browser tab.';
    messageContainer.className = 'error';
    loginForm.style.display = 'none';
}
// --- End of Storage Tester ---


// --- Click listener for the continue button ---
continueBtn.addEventListener('click', () => {
    // Manually navigate to the dashboard
    window.location.href = '/'; 
});
// -----------------------------------------------------


loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    // Hide old messages
    messageContainer.style.display = 'none';
    messageContainer.textContent = '';
    
    showSpinner(submitButton);

    try {
        const response = await fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'LOGIN',
                username: username,
                password: password
            }),
        });
        
        const result = await response.json();

        if (result.status === 'success') {
            // --- MODIFIED: On success, do NOT redirect ---
            
            // 1. Store the login session.
            localStorage.setItem('isLoggedIn', 'true');
            
            // 2. Hide the login form
            loginForm.style.display = 'none';
            messageContainer.style.display = 'none';

            // 3. Show the "Continue" button
            continueBtn.style.display = 'block';
            
            // Note: We intentionally stop and do NOT redirect.
            // The user must now click the "Continue" button.
            
        } else {
            // Show error message
            messageContainer.textContent = result.message;
            messageContainer.className = 'error';
            hideSpinner(submitButton); // Only hide spinner on failure
        }
        
    } catch (error) {
        messageContainer.textContent = 'Failed to connect to API. Check network.';
        messageContainer.className = 'error';
        hideSpinner(submitButton); // Only hide spinner on failure
    }
});
