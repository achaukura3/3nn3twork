const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');
const {
  isCloudinaryReady,
  uploadImageFromPath,
  deleteAssetByPublicId,
} = require('../utils/cloudinary');

module.exports = (io) => {
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
    cb(null, `user-avatar-${Date.now()}-${unique}${ext}`);
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

async function emitUsersSnapshot() {
  if (!io) return;

  const users = await User.find({}, 'username fullName profileImageUrl role isOnline');
  io.emit('users_updated', users);
}


 
router.post('/signup', async (req, res) => {
  try {
    const {
      username,
      password,
      fullName,
      dateOfBirth,
      interest,
      email,
      contactNumber,
    } = req.body;

    if (!fullName || !dateOfBirth || !interest || !email || !contactNumber) {
      return res.status(400).json({
        message: 'Name, date of birth, interest, email, and contact number are required',
      });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const allowedInterests = ['software', 'music', 'art', 'video-editing'];
    if (interest && !allowedInterests.includes(interest)) {
      return res.status(400).json({ message: 'Invalid interest value' });
    }

    const parsedDateOfBirth = dateOfBirth ? new Date(dateOfBirth) : undefined;
    if (dateOfBirth && Number.isNaN(parsedDateOfBirth.getTime())) {
      return res.status(400).json({ message: 'Invalid date of birth' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      password: hashedPassword,
      role: 'user',
      fullName: fullName ? String(fullName).trim() : undefined,
      dateOfBirth: parsedDateOfBirth,
      interest: interest || undefined,
      email: email ? String(email).trim().toLowerCase() : undefined,
      contactNumber: contactNumber ? String(contactNumber).trim() : undefined,
    });
    await newUser.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Error signing up' });
  }
});

router.post('/login', async (req, res) => {
    try {
      const username = (req.body.username || '').trim();
      const password = (req.body.password || '').trim();
      console.log('Login request received:', { username, password });

      const user = await User.findOne({ username });
      console.log('User fetched from DB:', user);

      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials (user not found)' });
      }

      const storedPassword = user.password;
      const isBcryptHash = typeof storedPassword === 'string' && storedPassword.startsWith('$2');
      let isPasswordMatch = false;

      if (isBcryptHash) {
        isPasswordMatch = await bcrypt.compare(password, storedPassword);
      } else {
        isPasswordMatch = storedPassword === password;
      }

      console.log('Password match result:', isPasswordMatch);

      if (!isPasswordMatch) {
        return res.status(401).json({ message: 'Invalid credentials (password mismatch)' });
      }

      if (!isBcryptHash) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });
      }

      await User.updateOne({ _id: user._id }, { $set: { isOnline: true } });
      const token = jwt.sign({ id: user._id, role: user.role }, 'secret_key');
      console.log('JWT token generated:', token);

      if (io) {
        io.emit('user_logged_in', {
          userId: user._id,
          username: user.username,
          role: user.role,
          isOnline: true,
        });

        await emitUsersSnapshot();
      }

      res.json({ token });
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  router.post('/logout', async (req, res) => {
    const { userId } = req.body;
  
    try {
      // Update the user's isOnline status to false
      const user = await User.findByIdAndUpdate(userId, { isOnline: false }, { new: true });

      if (io && user) {
        io.emit('user_logged_out', { userId: user._id });
        await emitUsersSnapshot();
      }

      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error logging out', error: error.message });
    }
  });
  router.get('/users', async (req, res) => {
    try {
      const users = await User.find({}, 'username fullName profileImageUrl role isOnline');
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
  });

  router.get('/me', authenticateToken, async (req, res) => {
    try {
      const user = await User.findById(req.user.id).select(
        'username role fullName dateOfBirth interest email contactNumber profileImageUrl'
      );

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.json(user);
    } catch (error) {
      return res.status(500).json({ message: 'Error fetching profile', error: error.message });
    }
  });

  router.put('/me', authenticateToken, upload.single('profileImage'), async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const allowedInterests = ['software', 'music', 'art', 'video-editing'];
      const nextInterest = req.body?.interest;
      if (nextInterest && !allowedInterests.includes(nextInterest)) {
        return res.status(400).json({ message: 'Invalid interest value' });
      }

      const nextDateOfBirth = req.body?.dateOfBirth ? new Date(req.body.dateOfBirth) : null;
      if (req.body?.dateOfBirth && Number.isNaN(nextDateOfBirth.getTime())) {
        return res.status(400).json({ message: 'Invalid date of birth' });
      }

      if (typeof req.body?.fullName === 'string') user.fullName = req.body.fullName.trim();
      if (typeof req.body?.dateOfBirth === 'string') user.dateOfBirth = nextDateOfBirth;
      if (typeof req.body?.interest === 'string') user.interest = nextInterest;
      if (typeof req.body?.email === 'string') user.email = req.body.email.trim().toLowerCase();
      if (typeof req.body?.contactNumber === 'string') user.contactNumber = req.body.contactNumber.trim();

      if (req.file?.filename) {
        const previousImageUrl = user.profileImageUrl;
        const previousProvider = user.profileImageMeta?.provider;
        const previousPublicId = user.profileImageMeta?.publicId;
        const previousLocalPath = resolveLocalUploadPathFromUrl(previousImageUrl);

        if (!isCloudinaryReady()) {
          await removeLocalFileIfExists(req.file.path);
          return res.status(503).json({
            message: 'Cloudinary is not configured for profile image uploads. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
          });
        }

        const uploadResult = await uploadImageFromPath(req.file.path, {
          folder: '3nn3twork/profile-images',
        });

        user.profileImageUrl = uploadResult.secure_url;
        user.profileImageMeta = {
          provider: 'cloudinary',
          publicId: uploadResult.public_id,
          resourceType: uploadResult.resource_type,
          format: uploadResult.format,
          bytes: uploadResult.bytes,
        };

        await removeLocalFileIfExists(req.file.path);

        if (previousProvider === 'cloudinary' && previousPublicId && previousPublicId !== uploadResult.public_id) {
          await deleteAssetByPublicId(previousPublicId);
        }

        if (previousProvider === 'local' && previousLocalPath) {
          await removeLocalFileIfExists(previousLocalPath);
        }
      }

      await user.save();

      return res.json({
        message: 'Profile updated',
        user: {
          _id: user._id,
          username: user.username,
          role: user.role,
          fullName: user.fullName,
          dateOfBirth: user.dateOfBirth,
          interest: user.interest,
          email: user.email,
          contactNumber: user.contactNumber,
          profileImageUrl: user.profileImageUrl || '',
        },
      });
    } catch (error) {
      return res.status(500).json({ message: 'Error updating profile', error: error.message });
    }
  });

  router.delete('/me', authenticateToken, async (req, res) => {
    try {
      const reason = String(req.body?.reason || '').trim();
      if (!reason) {
        return res.status(400).json({ message: 'A reason is required to delete this account' });
      }

      const deletedUser = await User.findByIdAndDelete(req.user.id);
      if (!deletedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      if (deletedUser.profileImageMeta?.provider === 'cloudinary' && deletedUser.profileImageMeta?.publicId) {
        await deleteAssetByPublicId(deletedUser.profileImageMeta.publicId);
      }

      if (deletedUser.profileImageMeta?.provider === 'local') {
        const localPath = resolveLocalUploadPathFromUrl(deletedUser.profileImageUrl);
        await removeLocalFileIfExists(localPath);
      }

      console.log(`Account deleted: userId=${req.user.id}; reason=${reason}`);

      if (io) {
        io.emit('user_logged_out', { userId: req.user.id });
        await emitUsersSnapshot();
      }

      return res.json({ message: 'Account deleted successfully' });
    } catch (error) {
      return res.status(500).json({ message: 'Error deleting account', error: error.message });
    }
  });

  return router;
};
