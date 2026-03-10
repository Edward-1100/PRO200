const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const User = require('../models/User')
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'
const PEPPER = process.env.PEPPER || 'dev_pepper'

router.post('/register', async (req, res) => {
  const {username, email, password} = req.body
  if (!username || !email || !password) return res.status(400).json({error: 'Missing fields'})

  const exists = await User.findOne({$or: [{email}, {username}]})
  if (exists) return res.status(400).json({error: 'User exists'})

  const hash = await bcrypt.hash(password + PEPPER, 10)
  const user = new User({username, email, passwordHash: hash})
  
  await user.save()
  const token = jwt.sign({id: user._id}, JWT_SECRET, {expiresIn: '72h'})

  res.json({token, user: {id: user._id, username, email}})
})

router.post('/login', async (req, res) => {
  const {email, password, identifier} = req.body
  const lookup = (identifier && String(identifier).trim()) || (email && String(email).trim())

  if (!lookup || !password) return res.status(400).json({error: 'Missing fields'})
  const user = await User.findOne({$or: [{email: lookup}, {username: lookup}]})
  if (!user) return res.status(401).json({error: 'Invalid credentials'})
  const ok = await bcrypt.compare(password + PEPPER, user.passwordHash)
  if (!ok) return res.status(401).json({error: 'Invalid credentials'})
  const token = jwt.sign({id: user._id}, JWT_SECRET, {expiresIn: '72h'})

  res.json({token, user: {id: user._id, username: user.username, email: user.email}})
})

module.exports = router
