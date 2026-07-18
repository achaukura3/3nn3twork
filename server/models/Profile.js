const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    profileName: { type: String, required: true }, // Ensure this is marked as required
    description: { type: String },
    type: { type: String, enum: ['business', 'personal'], default: 'personal' },
    profilePageUrl: { type: String },
    imageUrl: { type: String },
    imageMeta: {
        provider: { type: String, trim: true },
        publicId: { type: String, trim: true },
        resourceType: { type: String, trim: true },
        format: { type: String, trim: true },
        bytes: { type: Number },
    },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Profile', profileSchema);
