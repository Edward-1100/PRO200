const timeDisplay = document.getElementById('time-display')
const startBtn = document.getElementById('start-btn')
const pauseBtn = document.getElementById('pause-btn')
const resumeBtn = document.getElementById('resume-btn')
const stopBtn = document.getElementById('stop-btn')
const micBtn = document.getElementById('mic-btn')
const transcriptBox = document.getElementById('transcript')
const addBtn = document.getElementById('add-btn')
const subBtn = document.getElementById('sub-btn')
const adjustAmount = document.getElementById('adjust-amount')
const messagesDiv = document.getElementById('messages')
let clientId = localStorage.getItem('vc_client_id')


if (!clientId) {
  clientId = '_' + Math.random().toString(36).substr(2, 9)
  localStorage.setItem('vc_client_id', clientId)
}

const es = new EventSource('/events?clientId=' + clientId)
es.addEventListener('time', e => {
  const d = JSON.parse(e.data)
  updateDisplay(d.remainingSeconds)
})
es.addEventListener('message', e => {
  const d = JSON.parse(e.data)
  showMessage(d.text)
  speak(d.text)
})
es.addEventListener('alarm', e => {
  playBeep()
})
es.onerror = () => {showMessage('Event connection error')}
function updateDisplay(sec) {
  const s = Math.max(0, Math.round(sec || 0))
  const mm = Math.floor(s / 60).toString().padStart(2, '0')
  const ss = (s % 60).toString().padStart(2, '0')
  timeDisplay.textContent = `${mm}:${ss}`
}

function showMessage(text) {
  messagesDiv.textContent = text
  setTimeout(() => {if (messagesDiv.textContent === text) messagesDiv.textContent = ''}, 3000)
}

function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text)
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch(e) {}
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    o.type = 'sine'
    o.frequency.value = 880
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.start()
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1)
    setTimeout(()=>o.stop(), 1100)
  } catch(e) {}
}

async function sendCommand(text) {
  await fetch('/api/command', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({clientId, transcript: text})
  })
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
let recognition = null
let micOn = false
if (SpeechRecognition) {
  recognition = new SpeechRecognition()
  recognition.continuous = true
  recognition.interimResults = false
  recognition.lang = 'en-US'
  recognition.onresult = (e) => {
    const last = e.results[e.results.length - 1]
    const text = last[0].transcript.trim()
    transcriptBox.textContent = text
    sendCommand(text)
  }
  recognition.onend = () => {
    if (micOn) recognition.start()
  }
} else {
  micBtn.disabled = true
  transcriptBox.textContent = 'Speech recognition not supported'
}

micBtn.onclick = () => {
  if (!recognition) {alert('No speech API'); return}
  micOn = !micOn
  if (micOn) {recognition.start(); micBtn.textContent = 'Mic ON'}
  else {recognition.stop(); micBtn.textContent = 'Start Mic'}
}

startBtn.onclick = () => {sendCommand('start 30 seconds')}
pauseBtn.onclick = () => {sendCommand('pause')}
resumeBtn.onclick = () => {sendCommand('resume')}
stopBtn.onclick = () => {sendCommand('stop')}
addBtn.onclick = () => {
  const n = Number(adjustAmount.value) || 0
  sendCommand(`add ${n} seconds`)
}
subBtn.onclick = () => {
  const n = Number(adjustAmount.value) || 0
  sendCommand(`subtract ${n} seconds`)
}
updateDisplay(0)
