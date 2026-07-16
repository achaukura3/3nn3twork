const express = require('express');
const authenticateToken = require('../middleware/auth'); // Import authenticateToken
console.log('Imported authenticateToken:', authenticateToken);
const Friendship = require('../models/Friendship'); 

const Post = require('../models/Posts');
const router = express.Router();

// Create a new post
router.post('/post', authenticateToken, async (req, res) => {
    try {
        const { category, content } = req.body;

        // Debugging: Check if userId is available
        console.log('User ID from token:', req.user.id);

        if (!category || !content) {
            return res.status(400).json({ message: 'Category and content are required' });
        }

        const post = new Post({
            userId: req.user.id, // Attach the authenticated user's ID
            diary: null, // Optionally associate this with a diary
            title: `Post in ${category}`,
            content,
            category,
            createdAt: new Date(),
        });

        await post.save();
        console.log('Created Post:', post); // Debugging: Log the created post
        res.status(201).json(post);
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({ message: 'Failed to create post', error: error.message });
    }
});

// Fetch all posts (example for debugging)
router.get('/posts', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Fetch friendships where the user is involved
        const friendships = await Friendship.find({
            $or: [{ user1: userId }, { user2: userId }],
            status: 'accepted',
        });

        // Extract friend IDs
        const friendIds = friendships.map(f =>
            f.user1.toString() === userId ? f.user2.toString() : f.user1.toString()
        );

        // Include the user's own ID to show their posts as well
        const accessibleUserIds = [userId, ...friendIds];

        console.log('Accessible User IDs:', accessibleUserIds); // Debugging line

        // Fetch posts where the userId is in the accessible list
        const posts = await Post.find({ userId: { $in: accessibleUserIds } })
            .populate('userId', 'username') // Populate username for display
            .sort({ createdAt: -1 });

        res.status(200).json(posts);
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ message: 'Failed to fetch posts', error: error.message });
    }
});



module.exports = router;
