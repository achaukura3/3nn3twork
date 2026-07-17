const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    messageType: { type: String, enum: ['text', 'image', 'video', 'audio', 'file'], default: 'text' },
    mediaUrl: { type: String, default: '' },
    mediaName: { type: String, default: '' },
    mediaMime: { type: String, default: '' },
    allowDownload: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Message', MessageSchema);
