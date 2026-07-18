const mongoose = require('mongoose');

// Define the schema
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  fullName: { type: String, trim: true },
  dateOfBirth: { type: Date },
  interest: {
    type: String,
    enum: ['software', 'music', 'art', 'video-editing'],
  },
  email: { type: String, trim: true, lowercase: true, required: true },
  contactNumber: { type: String, trim: true, required: true },
  profileImageUrl: { type: String, trim: true },
  isOnline: { type: Boolean, default: false },
  diaries: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Diary' }],
 


});

// Export the model
module.exports = mongoose.model('User', UserSchema);