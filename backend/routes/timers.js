const express = require('express')
const router = express.Router()
const jwt = require('jsonwebtoken')
const SavedTimer = require('../models/Timer')
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

function auth(req, res, next) {
  const h = req.headers.authorization
  if (!h) return res.status(401).json({error: 'No token'})
  const token = h.replace('Bearer ', '')
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.userId = payload.id
    next()
  } catch (e) {
    return res.status(401).json({error: 'Invalid token'})
  }
}

function validateReminders(reminders, durationSeconds) {
  if (!Array.isArray(reminders)) return []
  return reminders.map(r => {
    const trigger = Number(r.triggerSeconds) || 0
    const label = r.label ? String(r.label) : ''
    const safeTrigger = Math.max(0, Math.min(durationSeconds || trigger, Math.round(trigger)))
    return {triggerSeconds: safeTrigger, label, type: r.type || 'remaining'}
  })
}

router.get('/', auth, async (req, res) => {
  const list = await SavedTimer.find({userId: req.userId}).sort({createdAt: -1})
  res.json(list)
})

router.post('/', auth, async (req, res) => {
  const {name, durationSeconds, reminders} = req.body
  if (!durationSeconds || durationSeconds <= 0) return res.status(400).json({error: 'Invalid duration'})
  const saneReminders = validateReminders(reminders, durationSeconds)
  const t = new SavedTimer({userId: req.userId, name: name || 'Untitled', durationSeconds, reminders: saneReminders})
  await t.save()
  res.status(201).json(t)
})

router.get('/:id', auth, async (req, res) => {
  const t = await SavedTimer.findOne({_id: req.params.id, userId: req.userId})
  if (!t) return res.status(404).json({error: 'Not found'})
  res.json(t)
})

router.put('/:id', auth, async (req, res) => {
  const {name, durationSeconds, reminders} = req.body
  const update = {}
  if (typeof name === 'string') update.name = name
  if (typeof durationSeconds === 'number') {
    if (durationSeconds <= 0) return res.status(400).json({error: 'Invalid duration'})
    update.durationSeconds = durationSeconds
  }
  if (reminders !== undefined) {
    update.reminders = validateReminders(reminders, update.durationSeconds || undefined)
  }
  const t = await SavedTimer.findOneAndUpdate(
    {_id: req.params.id, userId: req.userId},
    {$set: update},
    {new: true}
  )
  if (!t) return res.status(404).json({error: 'Not found'})
  res.json(t)
})

router.delete('/:id', auth, async (req, res) => {
  const result = await SavedTimer.deleteOne({_id: req.params.id, userId: req.userId})
  if (!result.deletedCount) return res.status(404).json({error: 'Not found'})
  res.json({ok: true})
})

module.exports = router
