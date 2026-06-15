document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    const login = document.getElementById('login').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('error-message');
    errorDiv.innerText = ''; 

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password })
        });

        const result = await response.json();

        if (response.ok) {
            localStorage.setItem('currentUser', JSON.stringify(result.user));
            window.location.href = result.redirect;
        } else {
            errorDiv.innerText = result.error;
        }
    } catch (error) {
        errorDiv.innerText = 'Помилка з\'єднання з сервером. Перевірте, чи запущений Node.js';
        console.error(error);
    }
});