const express = require('express');
const multer = require('multer');
const authenticateToken = require('../middleware/auth');
const Profile = require('../models/Profile');
const User = require('../models/User');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/profiles', authenticateToken, upload.single('profilePicture'), async (req, res) => {
  try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can create profiles' });
        }

    const { profileName, description, type, profilePageUrl } = req.body; // Access profileName from req.body
      const imageUrl = req.file ? req.file.path : null; // Use file path if a profile picture is uploaded

      if (!profileName) {
          return res.status(400).json({ message: 'Profile name is required' });
      }

      const newProfile = new Profile({
          user: req.user.id,
          profileName,
          description,
          type,
          profilePageUrl,
          imageUrl,
      });

      await newProfile.save();
      res.status(201).json({ message: 'Profile created successfully', profile: newProfile });
  } catch (error) {
      console.error('Error creating profile:', error);
      res.status(500).json({ message: 'Failed to create profile', error: error.message });
  }
});

router.get('/profiles', authenticateToken, async (req, res) => {
    try {
        const adminUsers = await User.find({ role: 'admin' }, '_id').lean();
        const adminIds = adminUsers.map((adminUser) => adminUser._id);

        if (adminIds.length === 0) {
            return res.status(200).json([]);
        }

        const profiles = await Profile.find({ user: { $in: adminIds } }).sort({ createdAt: -1 });
        if (!profiles || profiles.length === 0) {
            console.log('No profiles found');
            return res.status(200).json([]);
        }
        res.status(200).json(profiles);
    } catch (error) {
        console.error('Error fetching profiles:', error); // Detailed log
        res.status(500).json({ message: 'Failed to fetch profiles', error: error.message });
    }
});

router.put('/profiles/:id', authenticateToken, upload.single('profilePicture'), async (req, res) => {
  try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can update profiles' });
        }

    const { profileName, description, type, profilePageUrl } = req.body;
    const updateFields = {
        profileName,
        description,
        type,
        profilePageUrl,
    };

    if (req.file?.path) {
        updateFields.imageUrl = req.file.path;
    }

      const profile = await Profile.findByIdAndUpdate(
          req.params.id,
          updateFields,
          { new: true }
      );

      if (!profile) {
          return res.status(404).json({ message: 'Profile not found' });
      }

      res.status(200).json({ message: 'Profile updated successfully', profile });
  } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
});
router.delete('/profiles/:id', authenticateToken, async (req, res) => {
  try {
      if (req.user.role !== 'admin') {
          return res.status(403).json({ message: 'Only admins can delete profiles' });
      }

      const profile = await Profile.findOneAndDelete({
          _id: req.params.id,
          user: req.user.id,
      });

      if (!profile) {
          return res.status(404).json({ message: 'Profile not found or unauthorized' });
      }

      res.status(200).json({ message: 'Profile deleted successfully' });
  } catch (error) {
      console.error('Error deleting profile:', error);
      res.status(500).json({ message: 'Failed to delete profile', error: error.message });
  }
});
module.exports = router; // Export the router