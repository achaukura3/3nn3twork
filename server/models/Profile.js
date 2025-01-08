const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    profileName: { type: String, required: true }, // Ensure this is marked as required
    description: { type: String },
    type: { type: String, enum: ['business', 'personal'], default: 'personal' },
    imageUrl: { type: String },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Profile', profileSchema);
