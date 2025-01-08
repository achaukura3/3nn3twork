const mongoose = require('mongoose');

// Define the schema
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  isOnline: { type: Boolean, default: false },
  diaries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Diary' }],
 


});

// Export the model
module.exports = mongoose.model('User', UserSchema);