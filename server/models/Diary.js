const mongoose = require('mongoose');

console.log('Friendship model imported:', Friendship);
// Diary Schema
const diarySchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
});



const Diary = mongoose.model('Diary', diarySchema);


module.exports = { Diary };
