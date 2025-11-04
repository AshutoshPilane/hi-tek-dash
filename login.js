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
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                method: 'LOGIN', // This tells our Code.gs to use the handleLogin function
                username: username,
                password: password
            }),
        });
        
        const result = await response.json();

        if (result.status === 'success') {
    // SUCCESS! Store the login session.
    localStorage.setItem('isLoggedIn', 'true');

    // NEW: Redirect to the main dashboard WITH a flag
    // This flag tells index.html "I just came from a successful login"
    setTimeout(() => {
        window.location.href = '/?fromLogin=true'; 
    }, 100); // 100 milliseconds

} else {
// ...
            // Show error message
            messageContainer.textContent = result.message;
            messageContainer.className = 'error';
        }
        
    } catch (error) {
        messageContainer.textContent = 'Failed to connect to API. Check network.';
        messageContainer.className = 'error';
    } finally {
        hideSpinner(submitButton);
    }
});
