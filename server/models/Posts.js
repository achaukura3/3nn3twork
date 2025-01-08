const mongoose = require('mongoose');

// Define Post schema
const postSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    diary: { type: mongoose.Schema.Types.ObjectId, ref: 'Diary', required: false },
    title: { type: String, required: true },
    content: { type: String, required: true },
    category: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
});

// Export Post model
module.exports = mongoose.models.Post || mongoose.model('Posts', postSchema);
