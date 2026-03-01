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
  let currentEditingId = null;
  let cachedSavedTimers = [];

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
      reminders: currentReminders
    };

    try {
      const res = await fetch('/api/timers', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
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
      const j = await res.json();
      cachedSavedTimers = j || [];
      window._savedTimers = cachedSavedTimers;
      return cachedSavedTimers;
    } catch (e) {
      return [];
    }
  }
  window.fetchSavedTimers = fetchSavedTimers;

  function findSavedTimer(name) {
    if (!name) return null;
    const list = (Array.isArray(cachedSavedTimers) && cachedSavedTimers.length) ? cachedSavedTimers : (window._savedTimers || []);
    const needle = String(name).trim().toLowerCase();
    let exact = list.find(t => String(t.name || '').trim().toLowerCase() === needle);
    if (exact) return exact;
    let partial = list.find(t => String(t.name || '').trim().toLowerCase().includes(needle));
    if (partial) return partial;
    const compact = needle.replace(/[^a-z0-9]/g,'');
    return list.find(t => String(t.name || '').toLowerCase().replace(/[^a-z0-9]/g,'').includes(compact)) || null;
  }
  window.findSavedTimer = findSavedTimer;

  function renderSavedTimers(list) {
    cachedSavedTimers = list || [];
    const container = document.getElementById('sidebar');
    if (!container) return;
    const heading = container.querySelector('.sidebar-heading');
    while (container.firstChild) container.removeChild(container.firstChild);
    if (heading) container.appendChild(heading);
    for (const t of list) {
      const row = document.createElement('div');
      row.className = 'timer-row';
      const btn = document.createElement('button');
      btn.className = 'timer-item';
      btn.dataset.id = String(t._id || t.id || '');
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
      const actions = document.createElement('div');
      actions.className = 'timer-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'action-icon edit-btn';
      editBtn.title = 'Edit';
      editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSaveModalForEdit(t);
      });
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'action-icon del-btn';
      delBtn.title = 'Delete';
      delBtn.innerHTML = 'X';
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = confirm('Delete this timer?');
        if (!ok) return;
        const token = localStorage.getItem(JWT_KEY);
        if (!token) {showMessage('Sign in to delete timers'); return;}
        const id = String(t._id || t.id || '');
        try {
          const res = await fetch('/api/timers/' + id, {method: 'DELETE', headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token}
          });
          if (res.ok) {
            showMessage('Deleted');
            const list2 = await fetchSavedTimers();
            renderSavedTimers(list2);
          } else {
            const j = await res.json();
            showMessage(j.error || 'Delete failed');
          }
        } catch (err) {
          console.error('delete error', err);
          showMessage('Delete failed');
        }
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      row.appendChild(btn);
      row.appendChild(actions);
      container.appendChild(row);
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
    const allowed = ['start','set','pause','resume','stop','add','subtract','remove','minus','modify'];
    if (!obj.action || typeof obj.action !== 'string') return false;
    if (!allowed.includes(obj.action.toLowerCase())) return false;
    const clampNumber = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= -3600000 && v <= 3600000) ? Math.round(v) : null;
    if (obj.durationSeconds !== undefined && clampNumber(obj.durationSeconds) === null) return false;
    if (obj.reminders !== undefined) {
      if (!Array.isArray(obj.reminders)) return false;
      for (const r of obj.reminders) {
        if (typeof r !== 'object') return false;
        if (clampNumber(Number(r.triggerSeconds || r.trigger_seconds || 0)) === null) return false;
        if (typeof (r.label || r.name || r.msg || '') !== 'string') return false;
      }
    }
    return true;
  }

  async function parseWithLLM(transcript) {
    if (!webllmEngine) return null;
    let namesPrefix = '';
    if (Array.isArray(cachedSavedTimers) && cachedSavedTimers.length) {
      const names = cachedSavedTimers.map(t => String(t.name || '')).filter(Boolean).slice(0,20).join(', ');
      if (names) namesPrefix = `Known timers:${names}\n\n`;
    }
    const prompt = namesPrefix + `You are an assistant that converts natural language timer commands into a strict JSON command. Output ONLY valid JSON and nothing else.

Schema:
{
  "action": "start" | "pause" | "resume" | "stop" | "modify",
  "durationSeconds": <integer, optional>,
  "reminders": [{"triggerSeconds": <integer>, "label": "<string>"}]
}

Examples:
"Remind me in 8 minutes, and give a 2-minute warning" -> {"action":"start","durationSeconds":480,"reminders":[{"triggerSeconds":120,"label":"2 minutes left"}]}
"Start a timer for 20 seconds with a reminder half way through" -> {"action":"start","durationSeconds":20,"reminders":[{"triggerSeconds":10,"label":"Halfway"}]}
"Remind me in 5 minutes to take the pizza out" -> {"action":"start","durationSeconds":300,"reminders":[{"triggerSeconds":0,"label":"Take pizza out"}]}
"Set a 10-minute timer and warn me at 5 and 1 minute left" -> {"action":"start","durationSeconds":600,"reminders":[{"triggerSeconds":300,"label":"5 minutes left"},{"triggerSeconds":60,"label":"1 minute left"}]}
"Add thirty seconds to the timer" -> {"action":"modify","durationSeconds":30,"reminders":[]}
"Take away 2 minutes" -> {"action":"modify","durationSeconds":-120,"reminders":[]}
"Pause the timer now" -> {"action":"pause"}
"Resume the timer please" -> {"action":"resume"}
"Cancel the timer / stop everything" -> {"action":"stop"}
"Start a 1 hour and 15 minute timer for the lasagna" -> {"action":"start","durationSeconds":4500,"reminders":[]}
"Set timer for 2" -> {"action":"start","durationSeconds":120,"reminders":[]} 
"Remind me in 90 seconds, and also give me a warning 30 seconds before the end" -> {"action":"start","durationSeconds":90,"reminders":[{"triggerSeconds":30,"label":"30 seconds left"}]}
"Set a 7 minute timer give me a 2-minute warning and a 30-second warning" -> {"action":"start","durationSeconds":420,"reminders":[{"triggerSeconds":120,"label":"2 minutes left"},{"triggerSeconds":30,"label":"30 seconds left"}]}
"Start my Pasta Timer" -> {"action":"start","savedTimerName":"Pasta Timer"}
"Please run the 'Quick' timer" -> {"action":"start","savedTimerName":"Quick"}
"Start the timer called Baked Potato Timer" -> {"action":"start","savedTimerName":"Baked Potato Timer"}

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
      if (!aiCommand) return;
      let cmd = Object.assign({}, aiCommand);
      if (cmd.savedTimerName && (!cmd.durationSeconds || Number(cmd.durationSeconds) === 0)) {
        const lookup = (Array.isArray(cachedSavedTimers) && cachedSavedTimers.length) ? cachedSavedTimers : await fetchSavedTimers().catch(()=>[]);
        const name = String(cmd.savedTimerName || '').trim().toLowerCase();
        let found = (lookup || []).find(t => String(t.name || '').trim().toLowerCase() === name) || (lookup || []).find(t => String(t.name || '').trim().toLowerCase().startsWith(name)) || (lookup || []).find(t => String(t.name || '').trim().toLowerCase().includes(name));
        if (found) {
          cmd.durationSeconds = Number(found.durationSeconds || 0);
          cmd.reminders = Array.isArray(found.reminders) ? found.reminders.map(r => ({triggerSeconds: Number(r.triggerSeconds || 0), label: String(r.label || '')})) : [];
        } else {
          showMessage(`No saved timer named "${cmd.savedTimerName}"`);
          delete cmd.savedTimerName;
          return;
        }
        delete cmd.savedTimerName;
      }
      if (cmd.savedTimerId && (!cmd.durationSeconds || Number(cmd.durationSeconds) === 0)) {
        const lookup = (Array.isArray(cachedSavedTimers) && cachedSavedTimers.length) ? cachedSavedTimers : await fetchSavedTimers().catch(()=>[]);
        const found = (lookup || []).find(t => String(t._id || t.id || '') === String(cmd.savedTimerId || ''));
        if (found) {
          cmd.durationSeconds = Number(found.durationSeconds || 0);
          cmd.reminders = Array.isArray(found.reminders) ? found.reminders.map(r => ({triggerSeconds: Number(r.triggerSeconds || 0), label: String(r.label || '')})) : [];
        }
        delete cmd.savedTimerId;
      }
      await fetch('/api/command', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({clientId: localStorage.getItem('vc_client_id'), aiCommand: cmd, reminders: cmd.reminders || []})
      });
    } catch (err) {
      console.error('postAiCommand error', err);
      showMessage('Command error');
    }
  }
  window.postAiCommand = postAiCommand;

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

  const addTimerBtn = document.getElementById('addTimerBtn');
  const saveModal = document.getElementById('saveModal');
  const modalForm = document.getElementById('saveModalForm');
  const modalName = document.getElementById('modalName');
  const modalHours = document.getElementById('modalHours');
  const modalMinutes = document.getElementById('modalMinutes');
  const modalSeconds = document.getElementById('modalSeconds');
  const modalReminders = document.getElementById('modalReminders');
  const modalAddReminder = document.getElementById('modalAddReminder');
  const modalCancel = document.getElementById('modalCancel');

  function openSaveModal() {
    if (!saveModal) return;
    modalReminders.innerHTML = '';
    modalName.value = timerLabel.textContent || 'Untitled';
    const secs = Math.max(0, Number(totalSeconds || remainingSeconds || 0));
    modalHours.value = String(Math.floor(secs / 3600));
    modalMinutes.value = String(Math.floor((secs % 3600) / 60));
    modalSeconds.value = String(secs % 60);
    if (Array.isArray(currentReminders) && currentReminders.length) {
      for (const r of currentReminders) {
        const mins = Math.floor((Number(r.triggerSeconds || 0)) / 60);
        const secsRem = Math.max(0, Number(r.triggerSeconds || 0) - mins * 60);
        createReminderRow(mins, secsRem, String(r.label || ''));
      }
    }
    currentEditingId = null;
    saveModal.setAttribute('aria-hidden', 'false');
    saveModal.classList.add('open');
    modalName.focus();
  }

  function openSaveModalForEdit(t) {
    if (!saveModal) return;
    modalReminders.innerHTML = '';
    modalName.value = t.name || 'Untitled';
    const total = Math.max(0, Number(t.durationSeconds || 0));
    modalHours.value = String(Math.floor(total / 3600));
    modalMinutes.value = String(Math.floor((total % 3600) / 60));
    modalSeconds.value = String(total % 60);
    currentReminders = Array.isArray(t.reminders) ? t.reminders.map(r => ({triggerSeconds: Number(r.triggerSeconds) || 0, label: String(r.label || '')})) : [];
    for (const r of currentReminders) {
      const mins = Math.floor((Number(r.triggerSeconds || 0)) / 60);
      const secsRem = Math.max(0, Number(r.triggerSeconds || 0) - mins * 60);
      createReminderRow(mins, secsRem, String(r.label || ''));
    }
    currentEditingId = String(t._id || t.id || '');
    saveModal.setAttribute('aria-hidden', 'false');
    saveModal.classList.add('open');
    modalName.focus();
  }

  function closeSaveModal() {
    if (!saveModal) return;
    saveModal.setAttribute('aria-hidden', 'true');
    saveModal.classList.remove('open');
    modalReminders.innerHTML = '';
    currentEditingId = null;
  }

  function createReminderRow(mins = 0, secs = 0, label = '') {
    const row = document.createElement('div');
    row.className = 'modal-reminder-row';
    const timeWrap = document.createElement('div');
    timeWrap.className = 'rem-time';
    const inM = document.createElement('input');
    inM.type = 'number';
    inM.min = '0';
    inM.value = String(Number(mins) || 0);
    inM.className = 'rem-mins';
    inM.setAttribute('aria-label', 'minutes');
    const sep = document.createElement('span');
    sep.className = 'rem-sep';
    sep.textContent = ':';
    const inS = document.createElement('input');
    inS.type = 'number';
    inS.min = '0';
    inS.max = '59';
    inS.value = String(Number(secs) || 0);
    inS.className = 'rem-secs';
    inS.setAttribute('aria-label', 'seconds');
    timeWrap.appendChild(inM);
    timeWrap.appendChild(sep);
    timeWrap.appendChild(inS);
    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'rem-label';
    labelInput.placeholder = 'Reminder label';
    labelInput.value = label;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'rem-remove';
    removeBtn.setAttribute('aria-label', 'remove reminder');
    removeBtn.textContent = 'X';
    removeBtn.addEventListener('click', () => {row.remove();});
    row.appendChild(timeWrap);
    row.appendChild(labelInput);
    row.appendChild(removeBtn);
    modalReminders.appendChild(row);
  }

  if (addTimerBtn) addTimerBtn.addEventListener('click', openSaveModal);
  if (modalAddReminder) modalAddReminder.addEventListener('click', () => {createReminderRow(0, 0, '');});

  if (modalCancel) modalCancel.addEventListener('click', (e) => {e.preventDefault(); closeSaveModal();});

  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = String(modalName.value || '').trim() || 'Untitled';
    const h = Math.max(0, Number(modalHours.value) || 0);
    const m = Math.max(0, Number(modalMinutes.value) || 0);
    const s = Math.max(0, Number(modalSeconds.value) || 0);
    const duration = h * 3600 + m * 60 + s;
    if (!duration || duration <= 0) {
      showMessage('Please enter a valid duration');
      return;
    }
    const reminders = [];
    const rows = Array.from(modalReminders.querySelectorAll('.modal-reminder-row'));
    for (const r of rows) {
      const minsEl = r.querySelector('.rem-mins');
      const secsEl = r.querySelector('.rem-secs');
      const labEl = r.querySelector('.rem-label');
      const minsV = Math.max(0, Number(minsEl.value) || 0);
      const secsV = Math.max(0, Math.min(59, Number(secsEl.value) || 0));
      const labelV = String(labEl.value || '').trim() || '';
      const trigger = minsV * 60 + secsV;
      reminders.push({triggerSeconds: trigger, label: labelV || `Reminder at ${formatTime(trigger)}`});
    }
    const token = localStorage.getItem(JWT_KEY);
    if (!token) {showMessage('Sign in to save timers'); return;}
    const payload = {name, durationSeconds: duration, reminders};
    try {
      if (currentEditingId) {
        const id = currentEditingId;
        const res = await fetch('/api/timers/' + id, {
          method: 'PUT',
          headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
          body: JSON.stringify(payload)
        });
        const j = await res.json();
        if (res.ok) {
          showMessage('Timer updated');
          closeSaveModal();
          const list = await fetchSavedTimers();
          renderSavedTimers(list);
        } else {
          showMessage(j.error || 'Update failed');
        }
      } else {
        const res = await fetch('/api/timers', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
          body: JSON.stringify(payload)
        });
        const j = await res.json();
        if (res.ok) {
          showMessage('Timer saved');
          closeSaveModal();
          const list = await fetchSavedTimers();
          renderSavedTimers(list);
        } else {
          showMessage(j.error || 'Save failed');
        }
      }
    } catch (err) {
      console.error('modal save error', err);
      showMessage('Save failed');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && saveModal && saveModal.classList.contains('open')) {
      closeSaveModal();
    }
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
