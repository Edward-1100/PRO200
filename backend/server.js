const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const {v4: uuidv4} = require('uuid');
require('dotenv').config();
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/models', express.static(path.join(__dirname, 'ai_models')));

const authRoutes = require('./routes/auth');
const timersRoutes = require('./routes/timers');

app.use('/api/auth', authRoutes);
app.use('/api/timers', timersRoutes);

const clients = {};
const timers = {};

function sendEvent(clientId, type, payload) {
  const s = clients[clientId];
  if (!s) return;
  s.write(`event: ${type}\n`);
  s.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function createTimer(clientId) {
  const id = uuidv4();
  const timer = {
    id,
    clientId,
    durationSeconds: 0,
    remainingSeconds: 0,
    endTime: null,
    paused: true,
    interval: null,
    reminders: []
  };
  timers[clientId] = timer;
  return timer;
}

function ensureTimer(clientId) {
  return timers[clientId] || createTimer(clientId);
}

function clearTimerInterval(t) {
  if (t.interval) {
    clearInterval(t.interval);
    t.interval = null;
  }
}

function startTick(t) {
  console.log(`[startTick] client=${t.clientId} paused=${t.paused} endTime=${t.endTime} remaining=${t.remainingSeconds}`);
  clearTimerInterval(t);
  if (t.paused || !t.endTime || t.remainingSeconds <= 0) return;
  t.interval = setInterval(() => {
    if (t.paused) return;
    const now = Date.now();
    t.remainingSeconds = Math.max(0, Math.round((t.endTime - now) / 1000));
    sendEvent(t.clientId, 'time', {remainingSeconds: t.remainingSeconds});
    if (Array.isArray(t.reminders) && t.reminders.length) {
      for (const r of t.reminders) {
        if (!r.fired && t.remainingSeconds <= (Number(r.triggerSeconds) || 0)) {
          r.fired = true;
          sendEvent(t.clientId, 'reminder', {label: r.label, triggerSeconds: r.triggerSeconds});
        }
      }
    }
    if (t.remainingSeconds <= 0) {
      clearTimerInterval(t);
      t.paused = true;
      t.endTime = null;
      sendEvent(t.clientId, 'message', {text: 'Timer finished'});
      sendEvent(t.clientId, 'alarm', {});
      sendEvent(t.clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
    }
  }, 250);
}

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

function formatSecondsPretty(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0 && s > 0) return `${m} minute${m>1?'s':''} ${s} second${s>1?'s':''}`;
  if (m > 0) return `${m} minute${m>1?'s':''}`;
  return `${s} second${s>1?'s':''}`;
}

function executeStructuredCommand(clientId, cmd, reminders) {
  const t = ensureTimer(clientId);
  const action = (cmd && String(cmd.action || '').toLowerCase()) || '';
  const getSecsFromCmd = () => {
    if (typeof cmd.seconds === 'number') return Math.max(0, Math.round(Number(cmd.seconds) || 0));
    if (typeof cmd.minutes === 'number') return Math.max(0, Math.round(Number(cmd.minutes) * 60 || 0));
    if (typeof cmd.durationSeconds === 'number') return Math.max(0, Math.round(Number(cmd.durationSeconds) || 0));
    return 0;
  };

  if (action === 'start') {
    const secs = getSecsFromCmd();
    if (secs <= 0) return {ok: false, error: 'No duration specified'};
    t.durationSeconds = secs;
    t.remainingSeconds = secs;
    t.endTime = Date.now() + secs * 1000;
    t.paused = false;
    t.reminders = Array.isArray(reminders) ? reminders.map(r => ({triggerSeconds: Number(r.triggerSeconds) || 0, label: r.label || '', fired: false})) : [];
    startTick(t);
    sendEvent(clientId, 'message', {text: `Timer started for ${formatSecondsPretty(secs)}`});
    sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
    sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
    return {ok: true};
  }

  if (action === 'set') {
    const secs = getSecsFromCmd();
    if (secs <= 0) return {ok: false, error: 'No duration specified'};
    clearTimerInterval(t);
    t.durationSeconds = secs;
    t.remainingSeconds = secs;
    t.endTime = null;
    t.paused = true;
    t.reminders = Array.isArray(reminders) ? reminders.map(r => ({triggerSeconds: Number(r.triggerSeconds) || 0, label: r.label || '', fired: false})) : [];
    sendEvent(clientId, 'message', {text: `Timer set to ${formatSecondsPretty(secs)}`});
    sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
    sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
    return {ok: true};
  }

  if (action === 'pause') {
    if (!t.paused) {
      t.remainingSeconds = Math.max(0, Math.round((t.endTime - Date.now()) / 1000));
      t.paused = true;
      clearTimerInterval(t);
      sendEvent(clientId, 'message', {text: 'Timer paused'});
      sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
      sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
      return {ok: true};
    }
    return {ok: false, error: 'Already paused'};
  }

  if (action === 'resume') {
    if (t.paused && t.remainingSeconds > 0) {
      t.endTime = Date.now() + t.remainingSeconds * 1000;
      t.paused = false;
      startTick(t);
      sendEvent(clientId, 'message', {text: 'Resuming timer'});
      sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
      sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
      return {ok: true};
    }
    return {ok: false, error: 'Nothing to resume'};
  }

  if (action === 'stop') {
    t.paused = true;
    clearTimerInterval(t);
    t.remainingSeconds = 0;
    t.endTime = null;
    sendEvent(clientId, 'time', {remainingSeconds: 0});
    sendEvent(clientId, 'message', {text: 'Timer stopped'});
    sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
    return {ok: true};
  }

  if (action === 'add') {
    const amt = Number(cmd.amountSeconds || cmd.seconds || cmd.durationSeconds || 0) || 0;
    if (amt <= 0) return {ok: false, error: 'No amount specified to add'};
    t.remainingSeconds = Math.max(0, t.remainingSeconds + Math.round(amt));
    t.endTime = Date.now() + t.remainingSeconds * 1000;
    if (!t.paused) startTick(t);
    sendEvent(clientId, 'message', {text: `Added ${formatSecondsPretty(amt)}`});
    sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
    sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
    return {ok: true};
  }

  if (action === 'subtract' || action === 'remove' || action === 'minus') {
    const amt = Number(cmd.amountSeconds || cmd.seconds || cmd.durationSeconds || 0) || 0;
    if (amt <= 0) return {ok: false, error: 'No amount specified to subtract'};
    t.remainingSeconds = Math.max(0, t.remainingSeconds - Math.round(amt));
    t.endTime = Date.now() + t.remainingSeconds * 1000;
    if (!t.paused) startTick(t);
    sendEvent(clientId, 'message', {text: `Subtracted ${formatSecondsPretty(amt)}`});
    sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
    sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
    return {ok: true};
  }

  return {ok: false, error: 'Unknown structured action'};
}

function parseAndExecute(clientId, text, reminders) {
  console.log(`[parseAndExecute] client=${clientId} text=${String(text).slice(0,200)}`);
  const t = ensureTimer(clientId);
  const lower = (text || '').toLowerCase().trim();
  if (!lower) {
    console.log('[parseAndExecute] empty transcript');
    return {ok: false, error: 'Empty transcript'};
  }

  if (/\b(start|begin|set)\b/.test(lower)) {
    const m = lower.match(/(?:start|begin|set)(?: (?:a|the))?(?: ?timer)?(?: for)?\s*(.*)/);
    const tail = m && m[1] ? m[1].trim() : '';
    const secs = parseMixedUnits(tail);
    if (secs > 0) {
      t.durationSeconds = secs;
      t.remainingSeconds = secs;
      t.endTime = Date.now() + secs * 1000;
      t.paused = false;
      if (Array.isArray(reminders)) {
        t.reminders = reminders.map(r => ({triggerSeconds: r.triggerSeconds, label: r.label, fired: false}));
      } else {
        t.reminders = [];
      }
      startTick(t);
      sendEvent(clientId, 'message', {text: `Timer started for ${formatSecondsPretty(secs)}`});
      sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
      sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
      return {ok: true};
    }
    return {ok: false, error: 'No duration found for start command'};
  }

  if (/\b(pause|hold|wait|freeze)\b/.test(lower)) {
    if (!t.paused) {
      t.remainingSeconds = Math.max(0, Math.round((t.endTime - Date.now()) / 1000));
      t.paused = true;
      clearTimerInterval(t);
      sendEvent(clientId, 'message', {text: 'Timer paused'});
      sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
      sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
      return {ok: true};
    } else {
      return {ok: false, error: 'Already paused'};
    }
  }

  if (/\b(resume|continue|play)\b/.test(lower)) {
    if (t.paused && t.remainingSeconds > 0) {
      t.endTime = Date.now() + t.remainingSeconds * 1000;
      t.paused = false;
      startTick(t);
      sendEvent(clientId, 'message', {text: 'Resuming timer'});
      sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
      sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
      return {ok: true};
    } else {
      return {ok: false, error: 'Nothing to resume'};
    }
  }

  if (/\b(stop|reset|cancel)\b/.test(lower)) {
    t.paused = true;
    clearTimerInterval(t);
    t.remainingSeconds = 0;
    t.endTime = null;
    sendEvent(clientId, 'time', {remainingSeconds: 0});
    sendEvent(clientId, 'message', {text: 'Timer stopped'});
    sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
    return {ok: true};
  }

  if (/\b(add|plus)\b/.test(lower)) {
    const secs = parseMixedUnits(lower);
    if (secs <= 0) return {ok: false, error: 'No amount found to add'};
    t.remainingSeconds = Math.max(0, t.remainingSeconds + secs);
    t.endTime = Date.now() + t.remainingSeconds * 1000;
    if (!t.paused) startTick(t);
    sendEvent(clientId, 'message', {text: `Added ${formatSecondsPretty(secs)}`});
    sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
    sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
    return {ok: true};
  }

  if (/\b(subtract|remove|minus)\b/.test(lower)) {
    const secs = parseMixedUnits(lower);
    if (secs <= 0) return {ok: false, error: 'No amount found to subtract'};
    t.remainingSeconds = Math.max(0, t.remainingSeconds - secs);
    t.endTime = Date.now() + t.remainingSeconds * 1000;
    if (!t.paused) startTick(t);
    sendEvent(clientId, 'message', {text: `Subtracted ${formatSecondsPretty(secs)}`});
    sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
    sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
    return {ok: true};
  }
  return {ok: false, error: 'Unrecognized command'};
}

app.get('/events', (req, res) => {
  const clientId = req.query.clientId || req.headers['x-client-id'] || req.ip;
  console.log(`[SSE connect] clientId=${clientId}`);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  clients[clientId] = res;
  const t = ensureTimer(clientId);
  sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds});
  sendEvent(clientId, 'state', {paused: t.paused, remainingSeconds: t.remainingSeconds});
  req.on('close', () => {
    delete clients[clientId];
  });
});

app.post('/api/command', (req, res) => {
  const clientId = req.body.clientId || req.headers['x-client-id'] || req.ip;
  const aiCmd = req.body.aiCommand;
  const reminders = req.body.reminders;

  if (aiCmd && typeof aiCmd === 'object') {
    const allowed = ['start','set','pause','resume','stop','add','subtract','remove','minus'];
    if (!aiCmd.action || typeof aiCmd.action !== 'string') {
      return res.status(400).json({ok: false, error: 'Invalid aiCommand: missing action'});
    }
    if (!allowed.includes(String(aiCmd.action).toLowerCase())) {
      return res.status(400).json({ok: false, error: 'Invalid aiCommand: unsupported action'});
    }
    const result = executeStructuredCommand(clientId, aiCmd, reminders);
    return res.json(result);
  }

  const transcript = req.body.transcript || '';
  const result = parseAndExecute(clientId, transcript, reminders);
  res.json(result);
});

app.get('/api/state', (req, res) => {
  const clientId = req.query.clientId || req.headers['x-client-id'] || req.ip;
  const t = timers[clientId] || {remainingSeconds: 0, paused: true};
  res.json(t);
});
const PORT = process.env.PORT || 4000;
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/voice_timer').then(() => {app.listen(PORT, () => {console.log('Server running on http://localhost:' + PORT);});}).catch(err => {
  console.error('mongo connect error', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('Shutting down');
  for (const id of Object.keys(clients)) {
    try {clients[id].end();} catch (e) {}
  }
  for (const k of Object.keys(timers)) {
    clearTimerInterval(timers[k]);
  }
  await mongoose.disconnect();
  process.exit(0);
});
