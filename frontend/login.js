(() => {
  "use strict";

  const JWT_KEY = "auth_jwt";

  const primaryBtn = document.getElementById('primaryBtn');
  const toggleLink = document.getElementById('toggleLink');
  const toggleText = document.getElementById('toggleText');
  const formTitle = document.getElementById('formTitle');
  const formSub = document.getElementById('formSub');
  const usernameField = document.getElementById('usernameField');
  const statusEl = document.getElementById('loginStatus');
  const identifierLabel = document.getElementById('identifierLabel');

  const emailInput = document.getElementById('email');
  const passInput = document.getElementById('password');
  const userInput = document.getElementById('username');

  let mode = 'login';

  function setMode(m) {
    mode = m;
    if (mode === 'login') {
      formTitle.textContent = 'Sign In';
      formSub.innerHTML = 'Enter your credentials. A JWT will be stored in <code>localStorage</code> so the dashboard can detect your session.';
      usernameField.style.display = 'none';
      primaryBtn.textContent = 'Log In';
      toggleText.textContent = "Don't have an account?";
      toggleLink.textContent = 'Register';
      identifierLabel.textContent = 'Email or Username';
      emailInput.placeholder = 'you@example.com or username';
    } else {
      formTitle.textContent = 'Create Account';
      formSub.textContent = 'Register an account to save timers to your profile.';
      usernameField.style.display = 'block';
      primaryBtn.textContent = 'Register';
      toggleText.textContent = 'Already have an account?';
      toggleLink.textContent = 'Log In';
      identifierLabel.textContent = 'Email';
      emailInput.placeholder = 'you@example.com';
    }
    statusEl.textContent = '';
  }

  async function postAuth(path, body) {
    const res = await fetch('/api/auth' + path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    return res.json();
  }

  function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + type;
  }

  primaryBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const identifier = emailInput.value.trim();
    const password = passInput.value.trim();
    const username = userInput.value.trim();

    if (!identifier || !password || (mode === 'register' && !username)) {
      setStatus('Please fill required fields.', 'error');
      return;
    }

    if (mode === 'login') {
      setStatus('Logging in...');
      const r = await postAuth('/login', {identifier, password});
      if (r && r.token) {
        localStorage.setItem(JWT_KEY, r.token);
        setStatus('Logged in', 'success');
        setTimeout(() => {window.location.href = '/index.html';}, 400);
      } else {
        setStatus(r.error || 'Login failed', 'error');
      }
    } else {
      setStatus('Registering...');
      const r = await postAuth('/register', {username, email: identifier, password});
      if (r && r.token) {
        localStorage.setItem(JWT_KEY, r.token);
        setStatus('Registered', 'success');
        setTimeout(() => {window.location.href = '/index.html';}, 400);
      } else {
        setStatus(r.error || 'Registration failed', 'error');
      }
    }
  });

  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    setMode(mode === 'login' ? 'register' : 'login');
  });

  const form = document.getElementById('loginForm');
  form.addEventListener('submit', (e) => {e.preventDefault(); primaryBtn.click();});

  setMode('login');
})();
