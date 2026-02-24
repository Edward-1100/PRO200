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

  /* ── Speech state ─────────────────────────────────────── */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasSpeech = typeof SpeechRecognition === "function";
  let recognition = null;
  let micEnabled  = false;

  //WebLLM state
  let webllmEngine = null;
  let webllmInitProgress = 0;
  let webllmLoading = false;
  let webllmReady = false;
  const WEBLLM_MODULE = "https://esm.run/@mlc-ai/web-llm";
  const WEBLLM_MODEL_ID = "Llama-3.1-8B-Instruct-q4f32_1-MLC";

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
    const labels = {"": "Ready", running: "Running", paused: "Paused", done: "Done!"};
    timerStatusLabel.textContent = labels[state] ?? "Ready";
  }

  function setLocalTimerState(seconds, sourceLabel) {
    const safe = Math.max(0, Math.round(Number(seconds) || 0));
    totalSeconds     = safe;
    remainingSeconds = safe;
    updateDisplay();
    setDisplayState("");
    const src = sourceLabel ? `${sourceLabel} ` : "";
    timerStatus.textContent = `${src}timer set to ${formatTime(safe)}.`;
  }

  const saveBtn = document.getElementById('saveTimerBtn');
  let currentReminders = [];

  function updateSaveBtnVisibility() {
    if (!saveBtn) return;
    saveBtn.style.display = localStorage.getItem(JWT_KEY) ? 'inline-block' : 'none';
  }

  async function saveCurrentTimer() {
    if (!saveBtn) return;
    const token = localStorage.getItem(JWT_KEY);
    if (!token) {showMessage('Sign in to save timers'); return;}

    const payload = {
      name: timerLabel.textContent || 'Untitled',
      durationSeconds: (Number(totalSeconds) || Number(remainingSeconds) || 0),
      reminders: []
    };

    try {
      const res = await fetch('/api/timers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(payload)
      });
      const j = await res.json();
      if (res.ok) {
        showMessage('Timer saved');
        const list = await fetchSavedTimers();
        renderSavedTimers(list);
        updateSaveBtnVisibility();
        return;
      } else {
        showMessage(j.error || 'Save failed');
      }
    } catch (err) {
      console.error('saveTimer error', err);
      showMessage('Save failed');
    }
  }

  async function fetchSavedTimers() {
    const token = localStorage.getItem(JWT_KEY);
    if (!token) return [];
    try {
      const res = await fetch('/api/timers', {headers: {Authorization: 'Bearer ' + token}});
      if (!res.ok) return [];
      return await res.json();
    } catch (e) {
      return [];
    }
  }

  function renderSavedTimers(list) {
    const container = document.getElementById('sidebar');
    if (!container) return;
    const heading = container.querySelector('.sidebar-heading');
    while (container.firstChild) container.removeChild(container.firstChild);
    if (heading) container.appendChild(heading);
    for (const t of list) {
      const btn = document.createElement('button');
      btn.className = 'timer-item';
      btn.dataset.minutes = Math.floor((t.durationSeconds || 0) / 60);
      btn.dataset.seconds = (t.durationSeconds || 0) % 60;
      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = t.name || 'Untitled';
      const time = document.createElement('span');
      time.className = 'item-time';
      const mins = String(Math.floor((t.durationSeconds || 0) / 60)).padStart(2,'0');
      const secs = String((t.durationSeconds || 0) % 60).padStart(2,'0');
      time.textContent = `${mins}:${secs}`;
      btn.appendChild(name);
      btn.appendChild(time);
      btn.addEventListener('click', () => {
        presetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        minutesInput.value = String(btn.dataset.minutes || 0);
        secondsInput.value = String(btn.dataset.seconds || 0);
        timerLabel.textContent = name.textContent.trim();
        setLocalTimerState(Number(btn.dataset.minutes || 0) * 60 + Number(btn.dataset.seconds || 0), name.textContent.trim());
        currentReminders = Array.isArray(t.reminders) ? t.reminders.map(r => ({triggerSeconds: Number(r.triggerSeconds) || 0, label: String(r.label || '')})) : [];
      });
      container.appendChild(btn);
    }
  }

  async function loadAndRenderSavedTimers() {
    const token = localStorage.getItem(JWT_KEY);
    if (!token) return;
    const list = await fetchSavedTimers();
    renderSavedTimers(list);
  }

  if (saveBtn) saveBtn.addEventListener('click', saveCurrentTimer);

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
  function parseMixedUnits(text) {
    const re = /(\d+)\s*(minutes?|minute|mins?|m|seconds?|second|secs?|s)/gi;
    let total = 0;
    let m;
    while ((m = re.exec(text))) {
      const n = Number(m[1]);
      const u = m[2].toLowerCase();
      if (/^m/.test(u)) total += n * 60;
      else total += n;
    }
    if (total > 0) return total;
    const single = text.match(/(\d+)/);
    return single ? Number(single[1]) : 0;
  }

  async function applySpeechCommand(raw) {
    const text = raw.toLowerCase().trim();
    if (!text) return;
    if (webllmReady) {
      try {
        const ai = await parseWithLLM(text);
        if (ai) {
          await postAiCommand(ai);
          return;
        }
      } catch (e) {
      }
    }
    sendCommand(text);
  }
  window.applySpeechCommand = applySpeechCommand;

  //WebLLM integration
  async function initWebLLM() {
    if (webllmLoading || webllmReady) return;
    webllmLoading = true;
    timerStatus.textContent = 'LLM: initializing...';
    try {
      const webllm = await import(WEBLLM_MODULE);
      const CreateMLCEngine = webllm.CreateMLCEngine || webllm.CreateMLCEngineDefault || webllm.CreateMLCEngine;
      const progressCb = ({progress}) => {
        webllmInitProgress = progress;
        timerStatus.textContent = `LLM loading ${Math.round(progress * 100)}%`;
      };
      webllmEngine = await CreateMLCEngine(WEBLLM_MODEL_ID, {initProgressCallback: progressCb});
      webllmReady = true;
      timerStatus.textContent = 'LLM ready';
      setTimeout(() => {if (timerStatus.textContent === 'LLM ready') timerStatus.textContent = '';}, 1500);
    } catch (err) {
      webllmEngine = null;
      webllmReady = false;
      timerStatus.textContent = 'LLM unavailable';
      console.error('WebLLM init error', err);
      setTimeout(() => {if (timerStatus.textContent === 'LLM unavailable') timerStatus.textContent = '';}, 2000);
    } finally {
      webllmLoading = false;
    }
  }

  function extractFirstJson(str) {
    const start = str.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < str.length; i++) {
      const ch = str[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      if (depth === 0) {
        try {
          const candidate = str.slice(start, i + 1);
          const parsed = JSON.parse(candidate);
          return parsed;
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  function validateAiCommand(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const allowed = ['start','set','pause','resume','stop','add','subtract','remove','minus'];
    if (!obj.action || typeof obj.action !== 'string') return false;
    if (!allowed.includes(obj.action.toLowerCase())) return false;
    const clampNumber = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? Math.round(v) : null;
    if (obj.durationSeconds !== undefined && clampNumber(obj.durationSeconds) === null) return false;
    if (obj.seconds !== undefined && clampNumber(obj.seconds) === null) return false;
    if (obj.minutes !== undefined && clampNumber(obj.minutes) === null) return false;
    if (obj.amountSeconds !== undefined && clampNumber(obj.amountSeconds) === null) return false;
    if (obj.reminders !== undefined) {
      if (!Array.isArray(obj.reminders)) return false;
      for (const r of obj.reminders) {
        if (typeof r !== 'object') return false;
        if (clampNumber(Number(r.triggerSeconds || r.trigger_seconds || r.seconds)) === null) return false;
        if (typeof (r.label || r.name || r.msg || '') !== 'string') return false;
      }
    }
    return true;
  }

  async function parseWithLLM(transcript) {
    if (!webllmEngine) return null;
    const prompt = `You are an assistant that converts natural language timer commands into a strict JSON command. Output ONLY valid JSON and nothing else.

Schema:
{
  "action": "start"|"set"|"pause"|"resume"|"stop"|"add"|"subtract",
  "durationSeconds": <integer, optional>,
  "seconds": <integer, optional>,
  "minutes": <integer, optional>,
  "amountSeconds": <integer, optional>,
  "reminders": [{"triggerSeconds": <integer>, "label": "<string>"}]
}

Examples:
"Remind me in 8 minutes, and give a 2-minute warning" -> {"action":"start","durationSeconds":480,"reminders":[{"triggerSeconds":120,"label":"2 minutes left"}]}

Now convert this input to JSON: "${transcript.replace(/"/g, '\\"')}"`;
    try {
      const res = await webllmEngine.chat.completions.create({messages: [{role: 'user', content: prompt}], max_tokens: 96, temperature: 0});
      const text = (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) ? res.choices[0].message.content : (res && res.choices && res.choices[0] && res.choices[0].text) ? res.choices[0].text : null;
      console.log('WebLLM raw output: ', text);
      if (!text) return null;
      const parsed = extractFirstJson(String(text));
      console.log('WebLLM extracted JSON candidate: ', parsed);
      if (!parsed) return null;
      if (!validateAiCommand(parsed)) {
        console.log('WebLLM validation failed for candidate: ', parsed);
        return null;
      }
      if (Array.isArray(parsed.reminders)) {
        parsed.reminders = parsed.reminders.map(r => ({triggerSeconds: Number(r.triggerSeconds || r.trigger_seconds || 0), label: String(r.label || r.name || '')}));
      }
      return parsed;
    } catch (err) {
      console.error('LLM parse error', err);
      return null;
    }
  }
  window.parseWithLLM = parseWithLLM;

  async function postAiCommand(aiCommand) {
    try {
      await fetch('/api/command', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({clientId: localStorage.getItem('vc_client_id'), aiCommand, reminders: aiCommand.reminders || []})
      });
    } catch (err) {
      console.error('postAiCommand error', err);
      showMessage('Command error');
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
      recognition.onend = () => {if (micEnabled) recognition.start();};
    }
  }

  /* ── Sidebar toggle ───────────────────────────────────── */
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
  });

  /* ── Event wiring ─────────────────────────────────────── */
  setBtn.addEventListener("click",   () => {
    const mins = Math.max(0, Number(minutesInput.value) || 0);
    const secs = Math.max(0, Math.min(59, Number(secondsInput.value) || 0));
    const total = mins * 60 + secs;
    sendCommand(`set timer for ${total} seconds`, {reminders: currentReminders});
  });

  startBtn.addEventListener("click", () => {
    const mins = Math.max(0, Number(minutesInput.value) || 0);
    const secs = Math.max(0, Math.min(59, Number(secondsInput.value) || 0));
    const total = mins * 60 + secs;
    if (total > 0) sendCommand(`start timer for ${total} seconds`, {reminders: currentReminders});
    else sendCommand('start timer for 33 seconds', {reminders: currentReminders});
  });

  pauseBtn.addEventListener("click", () => sendCommand('pause'));
  resetBtn.addEventListener("click", () => sendCommand('stop'));
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
      setLocalTimerState(mins * 60 + secs, btn.querySelector(".item-name").textContent.trim());
    });
  });

  /* ── Init ─────────────────────────────────────────────── */
  updateAuthUi();
  updateMicUi();
  updateSaveBtnVisibility();
  loadAndRenderSavedTimers();
  initWebLLM();

  let clientId = localStorage.getItem('vc_client_id');
  if (!clientId) {
    clientId = '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('vc_client_id', clientId);
  }

  fetch('/api/state?clientId=' + clientId).then(r => r.json()).then(t => {remainingSeconds = Math.max(0, Math.round(t.remainingSeconds || 0)); updateDisplay();}).catch(()=>{});

  const es = new EventSource('/events?clientId=' + clientId);
  es.addEventListener('time', e => {
    try {
      const d = JSON.parse(e.data);
      remainingSeconds = Math.max(0, Math.round(d.remainingSeconds || 0));
      updateDisplay();
    } catch (err) {}
  });
  es.addEventListener('message', e => {
    try {
      const d = JSON.parse(e.data);
      showMessage(d.text);
      speak(d.text);
    } catch (err) {}
  });
  es.addEventListener('alarm', e => {
    playBeep();
  });
  es.addEventListener('reminder', e => {
    try {
      const d = JSON.parse(e.data);
      const label = d.label || `Reminder at ${d.triggerSeconds} seconds`;
      timerStatus.textContent = label;
      speak(label);
      playBeep();
      setTimeout(() => {if (timerStatus.textContent === label) timerStatus.textContent = '';}, 3000);
    } catch (err) {}
  });

  es.addEventListener('state', e => {
    try {
      const s = JSON.parse(e.data);
      setDisplayState(s.paused ? 'paused' : 'running');
      remainingSeconds = Math.max(0, Math.round(s.remainingSeconds || 0));
      updateDisplay();
    } catch (err) {}
  });

  es.onerror = () => {showMessage('Event connection error');};

  async function sendCommand(text, extras = {}) {
    try {
      await fetch('/api/command', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({clientId, transcript: text, ...extras})
      });
    } catch (err) {
      console.error('sendCommand error', err);
      showMessage('Command error');
    }
  }


  function showMessage(text) {
    if (!text) return;
    timerStatus.textContent = text;
    setTimeout(() => {if (timerStatus.textContent === text) timerStatus.textContent = '';}, 3000);
  }

  function speak(text) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 880;
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1);
      setTimeout(()=>o.stop(), 1100);
    } catch (e) {}
  }

})();
