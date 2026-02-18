(() => {
  "use strict";

  const JWT_KEY = "auth_jwt";

  /* ── DOM refs ─────────────────────────────────────────── */
  const authStatus    = document.getElementById("authStatus");
  const loginLink     = document.getElementById("loginLink");
  const logoutBtn     = document.getElementById("logoutBtn");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebar       = document.getElementById("sidebar");

  const minutesInput  = document.getElementById("minutesInput");
  const secondsInput  = document.getElementById("secondsInput");
  const timerDisplay  = document.getElementById("timerDisplay");
  const timerStatus   = document.getElementById("timerStatus");
  const timerStatusLabel = document.getElementById("timerStatusLabel");
  const timerLabel    = document.getElementById("timerLabel");

  const setBtn    = document.getElementById("setBtn");
  const startBtn  = document.getElementById("startBtn");
  const pauseBtn  = document.getElementById("pauseBtn");
  const resetBtn  = document.getElementById("resetBtn");

  const micToggleBtn = document.getElementById("micToggleBtn");
  const micState     = document.getElementById("micState");
  const transcript   = document.getElementById("transcript");

  const presetButtons = Array.from(document.querySelectorAll(".timer-item"));

  /* ── Timer state ──────────────────────────────────────── */
  let totalSeconds     = 0;
  let remainingSeconds = 0;
  let timerId          = null;

  /* ── Speech state ─────────────────────────────────────── */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasSpeech = typeof SpeechRecognition === "function";
  let recognition = null;
  let micEnabled  = false;

  /* ── Helpers ──────────────────────────────────────────── */
  function formatTime(value) {
    const s = Math.max(0, value);
    const m = String(Math.floor(s / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${m}:${sec}`;
  }

  function updateDisplay() {
    timerDisplay.textContent = formatTime(remainingSeconds);
  }

  function setDisplayState(state) {
    // state: "" | "running" | "paused" | "done"
    timerDisplay.className = state;
    const labels = { "": "Ready", running: "Running", paused: "Paused", done: "Done!" };
    timerStatusLabel.textContent = labels[state] ?? "Ready";
  }

  function stopTicking() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  /* ── Timer actions ────────────────────────────────────── */
  function setTimer(seconds, sourceLabel) {
    stopTicking();
    const safe = Math.max(0, seconds);
    totalSeconds     = safe;
    remainingSeconds = safe;
    updateDisplay();
    setDisplayState("");
    const src = sourceLabel ? `${sourceLabel} ` : "";
    timerStatus.textContent = `${src}timer set to ${formatTime(safe)}.`;
  }

  function setTimerFromInputs(sourceLabel) {
    const mins = Math.max(0, Number(minutesInput.value) || 0);
    const secs = Math.max(0, Math.min(59, Number(secondsInput.value) || 0));
    setTimer(mins * 60 + secs, sourceLabel || "");
  }

  function startTimer() {
    if (remainingSeconds <= 0) { timerStatus.textContent = "Set the timer first."; return; }
    if (timerId) return;

    setDisplayState("running");
    timerStatus.textContent = "Running...";

    timerId = setInterval(() => {
      remainingSeconds -= 1;
      updateDisplay();
      if (remainingSeconds <= 0) {
        stopTicking();
        remainingSeconds = 0;
        updateDisplay();
        setDisplayState("done");
        timerStatus.textContent = "Time is up!";
      }
    }, 1000);
  }

  function pauseTimer() {
    stopTicking();
    setDisplayState("paused");
    timerStatus.textContent = "Paused.";
  }

  function resetTimer() {
    stopTicking();
    remainingSeconds = totalSeconds;
    updateDisplay();
    setDisplayState("");
    timerStatus.textContent = "Reset.";
  }

  /* ── Auth UI ──────────────────────────────────────────── */
  function updateAuthUi() {
    const isSignedIn = Boolean(localStorage.getItem(JWT_KEY));
    authStatus.textContent = isSignedIn ? "Signed in" : "Not signed in";
    loginLink.style.display  = isSignedIn ? "none"         : "inline-block";
    logoutBtn.style.display  = isSignedIn ? "inline-block" : "none";
  }

  function logout() {
    localStorage.removeItem(JWT_KEY);
    updateAuthUi();
  }

  /* ── Mic UI ───────────────────────────────────────────── */
  function updateMicUi() {
    micState.textContent = micEnabled ? "Mic enabled" : "Mic disabled";
    micToggleBtn.classList.toggle("active", micEnabled);
    // Rebuild button inner content to refresh the dot animation class
    micToggleBtn.innerHTML = `
      <span class="mic-dot"></span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
      ${micEnabled ? "Disable Mic" : "Enable Mic"}`;
  }

  /* ── Voice commands ───────────────────────────────────── */
  function applySpeechCommand(raw) {
    const text = raw.toLowerCase().trim();
    if (!text) return;

    if (/\b(start|begin|go)\b/.test(text))              { startTimer(); return; }
    if (/\b(pause|hold|wait|freeze)\b/.test(text))      { pauseTimer(); return; }
    if (/\b(reset|restart|clear)\b/.test(text))         { resetTimer(); return; }

    const minuteMatch = text.match(/(\d+)\s*min(?:ute)?s?/);
    const secondMatch = text.match(/(\d+)\s*sec(?:ond)?s?/);

    if (/\bset\b/.test(text) && (minuteMatch || secondMatch)) {
      const mins = minuteMatch ? Number(minuteMatch[1]) : 0;
      const secs = secondMatch ? Number(secondMatch[1]) : 0;
      minutesInput.value = String(mins);
      secondsInput.value = String(Math.min(59, secs));
      setTimerFromInputs("Voice");
    }
  }

  /* ── Mic control ──────────────────────────────────────── */
  function startMic() {
    if (!hasSpeech) {
      timerStatus.textContent = "Web Speech API not supported in this browser.";
      return;
    }

    if (!recognition) {
      recognition = new SpeechRecognition();
      recognition.continuous     = true;
      recognition.interimResults = true;
      recognition.lang           = "en-US";

      recognition.onresult = (event) => {
        let latestText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          latestText += event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            applySpeechCommand(event.results[i][0].transcript);
          }
        }
        transcript.textContent = latestText.trim() || "Listening...";
      };

      recognition.onerror = () => {
        timerStatus.textContent = "Microphone erro...";
      };

      recognition.onend = () => {
        if (micEnabled) recognition.start();
      };
    }

    micEnabled = true;
    updateMicUi();
    transcript.textContent = "Listening...";
    recognition.start();
  }

  function stopMic() {
    micEnabled = false;
    updateMicUi();
    transcript.textContent = "";
    if (recognition) {
      recognition.onend = null;
      recognition.stop();
      recognition.onend = () => { if (micEnabled) recognition.start(); };
    }
  }

  /* ── Sidebar toggle ───────────────────────────────────── */
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });

  /* ── Event wiring ─────────────────────────────────────── */
  setBtn.addEventListener("click",   () => setTimerFromInputs("Manual"));
  startBtn.addEventListener("click", startTimer);
  pauseBtn.addEventListener("click", pauseTimer);
  resetBtn.addEventListener("click", resetTimer);
  logoutBtn.addEventListener("click", logout);

  micToggleBtn.addEventListener("click", () => {
    micEnabled ? stopMic() : startMic();
  });

  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      presetButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const mins = Number(btn.dataset.minutes) || 0;
      const secs = Number(btn.dataset.seconds) || 0;
      minutesInput.value = String(mins);
      secondsInput.value = String(secs);
      timerLabel.textContent = btn.querySelector(".item-name").textContent.trim();
      setTimer(mins * 60 + secs, btn.querySelector(".item-name").textContent.trim());
    });
  });

  /* ── Init ─────────────────────────────────────────────── */
  updateAuthUi();
  updateMicUi();
  setTimerFromInputs();
})();
