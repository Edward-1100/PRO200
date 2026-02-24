const mongoose = require('mongoose')
const Schema = mongoose.Schema

const ReminderSchema = new Schema({
  triggerSeconds: {type: Number, required: true},
  label: {type: String, default: ''},
  type: {type: String, default: 'remaining'}
}, {_id: false})

const TimerSchema = new Schema({
  userId: {type: Schema.Types.ObjectId, ref: 'User', required: true, index: true},
  name: {type: String, required: true},
  durationSeconds: {type: Number, required: true},
  reminders: {type: [ReminderSchema], default: []}
}, {timestamps: true})

module.exports = mongoose.model('SavedTimer', TimerSchema)
