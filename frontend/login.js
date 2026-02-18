(() => {
  "use strict";

  const JWT_KEY = "auth_jwt";

  const form        = document.getElementById("loginForm");
  const emailInput  = document.getElementById("email");
  const passInput   = document.getElementById("password");
  const loginStatus = document.getElementById("loginStatus");

  function createMockJwt(email) {
    const header  = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({
      sub:  email,
      role: "user",
      iat:  Math.floor(Date.now() / 1000),
      exp:  Math.floor(Date.now() / 1000) + 86400,
    }));
    const signature = btoa("demo-signature-replace-with-server-issued-token");
    return `${header}.${payload}.${signature}`;
  }

  function setStatus(msg, type = "") {
    loginStatus.textContent = msg;
    loginStatus.className   = "status " + type;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const email    = emailInput.value.trim();
    const password = passInput.value.trim();

    if (!email || !password) {
      setStatus("Please enter both email and password.", "error");
      return;
    }

    // In production: POST /api/login and store the server-issued JWT
    const token = createMockJwt(email);
    localStorage.setItem(JWT_KEY, token);

    setStatus("Login successful. Redirecting...", "success");
    setTimeout(() => { window.location.href = "index.html"; }, 600);
  });
})();
