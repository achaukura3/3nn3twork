const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const authenticateToken = require('../middleware/auth');
const Profile = require('../models/Profile');
const User = require('../models/User');
const {
    isCloudinaryReady,
    uploadImageFromPath,
    deleteAssetByPublicId,
} = require('../utils/cloudinary');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads');

const ensureUploadDirExists = () => {
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }
};

const uploadStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        ensureUploadDirExists();
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').slice(0, 10);
        const unique = crypto.randomBytes(8).toString('hex');
        cb(null, `admin-profile-${Date.now()}-${unique}${ext}`);
    },
});

const upload = multer({ storage: uploadStorage });

const removeLocalFileIfExists = async (filePath) => {
    if (!filePath) return;

    try {
        await fs.promises.unlink(filePath);
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn(`Local file cleanup warning for ${filePath}: ${error.message}`);
        }
    }
};

const resolveLocalUploadPathFromUrl = (urlValue) => {
    const normalized = String(urlValue || '').trim();
    if (!normalized.startsWith('/uploads/')) {
        return '';
    }

    const fileName = normalized.slice('/uploads/'.length);
    if (!fileName) {
        return '';
    }

    return path.join(__dirname, '..', 'uploads', fileName);
};

const buildProfileImagePayloadFromUpload = async (file) => {
    if (!file) return null;

    if (!isCloudinaryReady()) {
        await removeLocalFileIfExists(file.path);
        const error = new Error('Cloudinary is not configured for profile uploads. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
        error.statusCode = 503;
        throw error;
    }

    const uploadResult = await uploadImageFromPath(file.path, {
        folder: '3nn3twork/admin-profiles',
    });

    await removeLocalFileIfExists(file.path);

    return {
        imageUrl: uploadResult.secure_url,
        imageMeta: {
            provider: 'cloudinary',
            publicId: uploadResult.public_id,
            resourceType: uploadResult.resource_type,
            format: uploadResult.format,
            bytes: uploadResult.bytes,
        },
    };
};

router.post('/profiles', authenticateToken, upload.single('profilePicture'), async (req, res) => {
  try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Only admins can create profiles' });
        }

        const { profileName, description, type, profilePageUrl } = req.body;

      if (!profileName) {
          return res.status(400).json({ message: 'Profile name is required' });
      }

      const uploadedImage = await buildProfileImagePayloadFromUpload(req.file);

      const newProfile = new Profile({
          user: req.user.id,
          profileName,
          description,
          type,
          profilePageUrl,
          imageUrl: uploadedImage?.imageUrl || null,
          imageMeta: uploadedImage?.imageMeta,
      });

      await newProfile.save();
      res.status(201).json({ message: 'Profile created successfully', profile: newProfile });
  } catch (error) {
      console.error('Error creating profile:', error);
      res.status(error.statusCode || 500).json({ message: 'Failed to create profile', error: error.message });
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

    const profile = await Profile.findById(req.params.id);
    if (!profile) {
        if (req.file?.path) {
            await removeLocalFileIfExists(req.file.path);
        }
        return res.status(404).json({ message: 'Profile not found' });
    }

    const { profileName, description, type, profilePageUrl } = req.body;
    const updateFields = {
        profileName,
        description,
        type,
        profilePageUrl,
    };

    if (req.file) {
        const previousProvider = profile.imageMeta?.provider;
        const previousPublicId = profile.imageMeta?.publicId;
        const previousLocalPath = resolveLocalUploadPathFromUrl(profile.imageUrl);

        const uploadedImage = await buildProfileImagePayloadFromUpload(req.file);
        updateFields.imageUrl = uploadedImage?.imageUrl || null;
        updateFields.imageMeta = uploadedImage?.imageMeta;

        if (previousProvider === 'cloudinary' && previousPublicId && previousPublicId !== uploadedImage?.imageMeta?.publicId) {
            await deleteAssetByPublicId(previousPublicId);
        }

        if (previousProvider === 'local' && previousLocalPath) {
            await removeLocalFileIfExists(previousLocalPath);
        }
    }

      const updatedProfile = await Profile.findByIdAndUpdate(
          req.params.id,
          updateFields,
          { new: true }
      );

      res.status(200).json({ message: 'Profile updated successfully', profile: updatedProfile });
  } catch (error) {
      console.error('Error updating profile:', error);
      res.status(error.statusCode || 500).json({ message: 'Failed to update profile', error: error.message });
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

      if (profile.imageMeta?.provider === 'cloudinary' && profile.imageMeta?.publicId) {
          await deleteAssetByPublicId(profile.imageMeta.publicId);
      }

      if (profile.imageMeta?.provider === 'local') {
          const localPath = resolveLocalUploadPathFromUrl(profile.imageUrl);
          await removeLocalFileIfExists(localPath);
      }

      res.status(200).json({ message: 'Profile deleted successfully' });
  } catch (error) {
      console.error('Error deleting profile:', error);
      res.status(500).json({ message: 'Failed to delete profile', error: error.message });
  }
});
module.exports = router; // Export the router