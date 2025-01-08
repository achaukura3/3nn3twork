const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');

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
            });

            await newMessage.save();
            const sender = await User.findById(req.user.id).select('username');

            // Use the io object for emitting events
            io.to(receiver).emit('receive_message', {
                senderId: req.user.id,
                senderUsername: sender.username,
                content: newMessage.content,
                timestamp: newMessage.timestamp,
            });

            res.status(201).json({ message: 'Message sent', data: newMessage });
        } catch (error) {
            console.error('Error saving message:', error);
            res.status(500).json({ message: 'Failed to send message', error: error.message });
        }
    });

    return router;
};
