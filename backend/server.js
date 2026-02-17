const express = require('express')
const cors = require('cors')
const {v4: uuidv4} = require('uuid')
const path = require('path')
const app = express()
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'frontend')))

const clients = {}  
const timers = {}

function sendEvent(clientId, type, payload) {
  const s = clients[clientId]
  if (!s) return
  s.write(`event: ${type}\n`)
  s.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function createTimer(clientId) {
  const id = uuidv4()
  const timer = {
    id,
    clientId,
    durationSeconds: 0,
    remainingSeconds: 0,
    endTime: null,
    paused: true,
    interval: null
  }
  timers[clientId] = timer
  return timer
}

function ensureTimer(clientId) {
  return timers[clientId] || createTimer(clientId)
}

function clearTimerInterval(t) {
  if (t.interval) {
    clearInterval(t.interval)
    t.interval = null
  }
}

function startTick(t) {
  clearTimerInterval(t)
  t.interval = setInterval(() => {
    if (t.paused) return
    const now = Date.now()
    t.remainingSeconds = Math.max(0, Math.round((t.endTime - now) / 1000))
    sendEvent(t.clientId, 'time', {remainingSeconds: t.remainingSeconds})
    if (t.remainingSeconds <= 0) {
      clearTimerInterval(t)
      t.paused = true
      sendEvent(t.clientId, 'message', {text: 'Timer finished'})
      sendEvent(t.clientId, 'alarm', {})
    }
  }, 250)
}

function parseAndExecute(clientId, text) {
  const t = ensureTimer(clientId)
  const lower = (text || '').toLowerCase()
  let m
  if ((m = lower.match(/start (?:a )?(\d+)\s*(minutes?|minute|seconds?|secs?|sec)?/))) {
    const num = Number(m[1])
    const unit = (m[2] || '').toLowerCase()
    const secs = unit.startsWith('min') ? num * 60 : num
    t.durationSeconds = secs
    t.remainingSeconds = secs
    t.endTime = Date.now() + secs * 1000
    t.paused = false
    startTick(t)
    sendEvent(clientId, 'message', {text: `Timer started for ${secs} seconds`})
    return {ok: true}
  }
  if ((m = lower.match(/pause|hold/))) {
    if (!t.paused) {
      t.remainingSeconds = Math.max(0, Math.round((t.endTime - Date.now()) / 1000))
      t.paused = true
      clearTimerInterval(t)
      sendEvent(clientId, 'message', {text: 'Timer paused'})
      return {ok: true}
    } else {
      return {ok: false, error: 'Already paused'}
    }
  }
  if ((m = lower.match(/resume|continue/))) {
    if (t.paused && t.remainingSeconds > 0) {
      t.endTime = Date.now() + t.remainingSeconds * 1000
      t.paused = false
      startTick(t)
      sendEvent(clientId, 'message', {text: 'Resuming timer'})
      return {ok: true}
    } else {
      return {ok: false, error: 'Nothing to resume'}
    }
  }
  if ((m = lower.match(/stop|reset/))) {
    t.paused = true
    clearTimerInterval(t)
    t.remainingSeconds = 0
    t.endTime = null
    sendEvent(clientId, 'time', {remainingSeconds: 0})
    sendEvent(clientId, 'message', {text: 'Timer stopped'})
    return {ok: true}
  }
  if ((m = lower.match(/add\s+(\d+)\s*(minutes?|minute|seconds?|secs?|sec)/))) {
    const num = Number(m[1])
    const unit = m[2]
    const secs = /min/i.test(unit) ? num * 60 : num
    t.remainingSeconds = Math.max(0, t.remainingSeconds + secs)
    t.endTime = Date.now() + t.remainingSeconds * 1000
    if (!t.paused) startTick(t)
    sendEvent(clientId, 'message', {text: `Added ${secs} seconds`})
    sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds})
    return {ok: true}
  }
  if ((m = lower.match(/(subtract|remove)\s+(\d+)\s*(minutes?|minute|seconds?|secs?|sec)/))) {
    const num = Number(m[2])
    const unit = m[3]
    const secs = /min/i.test(unit) ? num * 60 : num
    t.remainingSeconds = Math.max(0, t.remainingSeconds - secs)
    t.endTime = Date.now() + t.remainingSeconds * 1000
    if (!t.paused) startTick(t)
    sendEvent(clientId, 'message', {text: `Subtracted ${secs} seconds`})
    sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds})
    return {ok: true}
  }
  return {ok: false, error: 'Unrecognized command'}
}

app.get('/events', (req, res) => {
  const clientId = req.query.clientId || req.headers['x-client-id'] || req.ip
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  clients[clientId] = res
  const t = ensureTimer(clientId)
  sendEvent(clientId, 'time', {remainingSeconds: t.remainingSeconds})
  req.on('close', () => {
    delete clients[clientId]
  })
})

app.post('/api/command', (req, res) => {
  const clientId = req.body.clientId || req.headers['x-client-id'] || req.ip
  const transcript = req.body.transcript || ''
  const result = parseAndExecute(clientId, transcript)
  res.json(result)
})

app.get('/api/state', (req, res) => {
  const clientId = req.query.clientId || req.headers['x-client-id'] || req.ip
  const t = timers[clientId] || {remainingSeconds: 0, paused: true}
  res.json(t)
})

app.listen(4000, () => {
  console.log('Server running on http://localhost:4000')
})
