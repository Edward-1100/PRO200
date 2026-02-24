const mongoose = require('mongoose')
const Schema = mongoose.Schema
const UserSchema = new Schema({
  username: {type: String, required: true, unique: true},
  email: {type: String, required: true, unique: true},
  passwordHash: {type: String, required: true},
  createdAt: {type: Date, default: Date.now}
})
module.exports = mongoose.model('User', UserSchema)
