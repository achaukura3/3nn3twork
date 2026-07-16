const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authenticateToken = require('../middleware/auth');

const router = express.Router();


 
router.post('/signup', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword, role });
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
      await User.updateOne({ _id: userId }, { isOnline: false });
      res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error logging out', error: error.message });
    }
  });
  router.get('/users', async (req, res) => {
    try {
      const users = await User.find({}, 'username role isOnline'); // Fetch only required fields
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
  });

  module.exports = router;
