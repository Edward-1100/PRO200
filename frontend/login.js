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
  const form = document.getElementById('loginForm');

  if (!primaryBtn || !toggleLink || !toggleText || !formTitle || !formSub || !usernameField ||
      !statusEl || !identifierLabel || !emailInput || !passInput || !userInput || !form) {
    // Required elements missing; avoid runtime errors on partially loaded pages.
    console.error('Login page is missing required elements.');
    return;
  }

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

  function setBusy(isBusy) {
    primaryBtn.disabled = isBusy;
    primaryBtn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  }

  async function postAuth(path, body) {
    const res = await fetch('/api/auth' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await res.json() : { error: await res.text() };

    if (!res.ok) {
      const err = payload && payload.error ? payload.error : 'Request failed';
      throw new Error(err);
    }

    return payload;
  }

  function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = 'status ' + type;
  }

  function validateInputs(identifier, password, username) {
    if (!identifier || !password || (mode === 'register' && !username)) {
      return 'Please fill required fields.';
    }
    if (password.length < 6) {
      return 'Password must be at least 6 characters.';
    }
    if (mode === 'register' && username.length < 2) {
      return 'Username must be at least 2 characters.';
    }
    return '';
  }

  async function handleSubmit() {
    const identifier = emailInput.value.trim();
    const password = passInput.value.trim();
    const username = userInput.value.trim();

    const validationError = validateInputs(identifier, password, username);
    if (validationError) {
      setStatus(validationError, 'error');
      return;
    }

    if (mode === 'login') {
      setStatus('Logging in...');
      setBusy(true);
      try {
        const r = await postAuth('/login', { identifier, password });
        if (r && r.token) {
          localStorage.setItem(JWT_KEY, r.token);
          setStatus('Logged in', 'success');
          setTimeout(() => { window.location.href = '/index.html'; }, 400);
        } else {
          setStatus('Login failed', 'error');
        }
      } catch (err) {
        setStatus(err.message || 'Login failed', 'error');
      } finally {
        setBusy(false);
      }
    } else {
      setStatus('Registering...');
      setBusy(true);
      try {
        const r = await postAuth('/register', { username, email: identifier, password });
        if (r && r.token) {
          localStorage.setItem(JWT_KEY, r.token);
          setStatus('Registered', 'success');
          setTimeout(() => { window.location.href = '/index.html'; }, 400);
        } else {
          setStatus('Registration failed', 'error');
        }
      } catch (err) {
        setStatus(err.message || 'Registration failed', 'error');
      } finally {
        setBusy(false);
      }
    }
  }

  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    setMode(mode === 'login' ? 'register' : 'login');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSubmit();
  });

  setMode('login');
})();
