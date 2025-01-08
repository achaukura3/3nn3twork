
const express = require('express');
const Friendship = require('../models/Friendship'); // Import Friendship model
const authenticateToken = require('../middleware/auth'); // Import authentication middleware

const router = express.Router();

router.post('/friends/request', authenticateToken, async (req, res) => {
    const { friendId } = req.body;
    try {
        const friendship = new Friendship({
            user1: req.user.id,
            user2: friendId,
        });
        await friendship.save();
        res.status(200).json({ message: 'Friend request sent' });
    } catch (error) {
        console.error('Error sending friend request:', error);
        res.status(500).json({ message: 'Failed to send friend request' });
    }
  });
  
  router.post('/friends/accept', authenticateToken, async (req, res) => {
    const { friendId } = req.body;
    try {
        const friendship = await Friendship.findOneAndUpdate(
            { user1: friendId, user2: req.user.id, status: 'pending' },
            { status: 'accepted' },
            { new: true }
        );
        res.status(200).json({ message: 'Friend request accepted', friendship });
    } catch (error) {
        console.error('Error accepting friend request:', error);
        res.status(500).json({ message: 'Failed to accept friend request' });
    }
  });
  
  router.get('/friends', authenticateToken, async (req, res) => {
    try {
        const friendships = await Friendship.find({
            $or: [{ user1: req.user.id }, { user2: req.user.id }],
            status: 'accepted',
        }).populate('user1 user2', 'username');
  
        res.status(200).json(friendships);
    } catch (error) {
        console.error('Error fetching friends:', error);
        res.status(500).json({ message: 'Failed to fetch friends' });
    }
  });

  module.exports = router; // Export the router 