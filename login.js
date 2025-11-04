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

// --- Storage Tester ---
try {
    localStorage.setItem('__test__', '1');
    localStorage.removeItem('__test__');
} catch (e) {
    messageContainer.textContent = 'Error: Browser storage is blocked. Please disable Private Browsing mode.';
    messageContainer.className = 'error';
    loginForm.style.display = 'none';
}
// --- End of Storage Tester ---

// --- Click listener for the continue button ---
continueBtn.addEventListener('click', () => {
    window.location.href = '/'; 
});
// -----------------------------------------------------

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitButton = loginForm.querySelector('button[type="submit"]');
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
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
            
            // --- MODIFIED: Added SameSite=Strict ---
            document.cookie = "isLoggedIn=true; path=/; max-age=3600; SameSite=Strict";
            // ---------------------------------------
            
            loginForm.style.display = 'none';
            messageContainer.style.display = 'none';
            continueBtn.style.display = 'block';
            
        } else {
            messageContainer.textContent = result.message;
            messageContainer.className = 'error';
            hideSpinner(submitButton);
        }
        
    } catch (error) {
        messageContainer.textContent = 'Failed to connect to API. Check network.';
        messageContainer.className = 'error';
        hideSpinner(submitButton);
    }
});
