const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const mediaStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, path.join(__dirname, '..', 'uploads'));
    },
    filename: (_req, file, cb) => {
        const uniqueId = crypto.randomBytes(16).toString('hex');
        const safeExt = path.extname(file.originalname || '').toLowerCase();
        cb(null, `${uniqueId}${safeExt}`);
    },
});

const uploadMedia = multer({ storage: mediaStorage });

function detectMessageTypeFromMime(mime = '') {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'file';
}

module.exports = (io) => {
    const router = express.Router();

    router.get('/:receiverId', authenticateToken, async (req, res) => {
        try {
            const { receiverId } = req.params;
            const messages = await Message.find({
                $or: [
                    { sender: req.user.id, receiver: receiverId },
                    { sender: receiverId, receiver: req.user.id },
                ],
            }).sort({ timestamp: 1 });

            res.status(200).json(messages);
        } catch (error) {
            console.error('Error fetching messages:', error);
            res.status(500).json({ message: 'Failed to fetch messages', error: error.message });
        }
    });

    router.post('/', authenticateToken, async (req, res) => {
        try {
            const { receiver, content } = req.body;

            if (!receiver || !content) {
                return res.status(400).json({ message: 'Receiver and content are required.' });
            }

            const newMessage = new Message({
                sender: req.user.id,
                receiver,
                content,
                messageType: 'text',
            });

            await newMessage.save();
            const sender = await User.findById(req.user.id).select('username');

            // Use the io object for emitting events
            io.to(receiver).emit('receive_message', {
                senderId: req.user.id,
                senderUsername: sender.username,
                content: newMessage.content,
                messageType: newMessage.messageType,
                mediaUrl: newMessage.mediaUrl,
                mediaName: newMessage.mediaName,
                mediaMime: newMessage.mediaMime,
                allowDownload: newMessage.allowDownload,
                timestamp: newMessage.timestamp,
            });

            res.status(201).json({ message: 'Message sent', data: newMessage });
        } catch (error) {
            console.error('Error saving message:', error);
            res.status(500).json({ message: 'Failed to send message', error: error.message });
        }
    });

    router.post('/media', authenticateToken, uploadMedia.single('file'), async (req, res) => {
        try {
            const { receiver, content } = req.body;
            const allowDownload = String(req.body?.allowDownload || '').toLowerCase() === 'true';

            if (!receiver) {
                return res.status(400).json({ message: 'Receiver is required.' });
            }

            if (!req.file) {
                return res.status(400).json({ message: 'A media file is required.' });
            }

            const mediaUrl = `/uploads/${req.file.filename}`;
            const messageType = detectMessageTypeFromMime(req.file.mimetype || '');

            const newMessage = new Message({
                sender: req.user.id,
                receiver,
                content: typeof content === 'string' ? content : '',
                messageType,
                mediaUrl,
                mediaName: req.file.originalname || req.file.filename,
                mediaMime: req.file.mimetype || '',
                allowDownload,
            });

            await newMessage.save();
            const sender = await User.findById(req.user.id).select('username fullName profileImageUrl');

            io.to(receiver).emit('receive_message', {
                senderId: req.user.id,
                senderUsername: sender?.fullName || sender?.username || 'User',
                senderProfileImageUrl: sender?.profileImageUrl || '',
                content: newMessage.content,
                messageType: newMessage.messageType,
                mediaUrl: newMessage.mediaUrl,
                mediaName: newMessage.mediaName,
                mediaMime: newMessage.mediaMime,
                allowDownload: newMessage.allowDownload,
                timestamp: newMessage.timestamp,
            });

            res.status(201).json({ message: 'Media message sent', data: newMessage });
        } catch (error) {
            console.error('Error sending media message:', error);
            res.status(500).json({ message: 'Failed to send media message', error: error.message });
        }
    });

    return router;
};
