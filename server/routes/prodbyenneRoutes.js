const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const authenticateToken = require('../middleware/auth');
const User = require('../models/User');
const Booking = require('../models/Booking');
const ProdbyenneContent = require('../models/ProdbyenneContent');

const router = express.Router();

const DEFAULT_CONTENT = {
  beats: [
    { id: 1, title: 'Midnight Session', genre: 'Trap / Dark', bpm: 140, key: 'F# min', duration: '2:34', plays: '12.4K', audioUrl: '' },
    { id: 2, title: 'Golden Hour', genre: 'R&B / Soul', bpm: 92, key: 'Bb maj', duration: '3:12', plays: '8.9K', audioUrl: '' },
    { id: 3, title: 'Concrete Jungle', genre: 'Boom Bap', bpm: 87, key: 'A min', duration: '2:58', plays: '21.1K', audioUrl: '' },
    { id: 4, title: 'Neon Haze', genre: 'Lo-Fi / Chill', bpm: 75, key: 'D maj', duration: '3:44', plays: '6.3K', audioUrl: '' },
    { id: 5, title: 'Phantom Frequency', genre: 'Drill', bpm: 142, key: 'C min', duration: '2:21', plays: '18.7K', audioUrl: '' },
    { id: 6, title: 'Studio Chronicles', genre: 'Hip-Hop / West', bpm: 98, key: 'G min', duration: '3:05', plays: '9.2K', audioUrl: '' },
  ],
  videos: [
    { id: 1, title: 'Full Studio Session — Marcus Layne', type: 'Session Recording', year: '2024', img: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&h=450&fit=crop&auto=format' },
    { id: 2, title: 'Beat Making: Midnight Session', type: 'Beat Breakdown', year: '2024', img: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800&h=450&fit=crop&auto=format' },
    { id: 3, title: 'Live Mix — Warehouse Set', type: 'Live Recording', year: '2023', img: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&h=450&fit=crop&auto=format' },
    { id: 4, title: 'Artist EP: Delara — Full Project', type: 'EP Production', year: '2023', img: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=800&h=450&fit=crop&auto=format' },
  ],
  hero: {
    backgroundImg: 'https://images.unsplash.com/photo-1598653222000-6b7b7a552625?w=1600&h=900&fit=crop&auto=format',
    tagline: 'Producer · Sound Recorder · Engineer',
    bio: '10+ years crafting beats, recording artists, and delivering mixes that move. Based in Los Angeles — working worldwide.',
  },
  about: {
    photo: 'https://images.unsplash.com/photo-1520872024865-3ff2805d8bb3?w=700&h=875&fit=crop&auto=format',
    bio1: 'I started making beats at 16 on a cracked copy of FL Studio in my bedroom. What began as a hobby became an obsession — and eventually a career.',
    bio2: 'My background spans both sides of the glass. I produce, but I also record and mix — which means I think about how a track will sound before a single note is laid down.',
    bio3: "I've worked with independent artists, major-label adjacent acts, and everything in between. No filler, no shortcuts, just music that lasts.",
  },
};

function sanitizeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeBeat(input, fallbackId) {
  return {
    id: Number(input.id) || fallbackId,
    title: sanitizeString(input.title),
    genre: sanitizeString(input.genre),
    bpm: Number(input.bpm) || 0,
    key: sanitizeString(input.key),
    duration: sanitizeString(input.duration),
    plays: sanitizeString(input.plays, '0'),
    audioUrl: sanitizeString(input.audioUrl),
  };
}

function normalizeVideo(input, fallbackId) {
  return {
    id: Number(input.id) || fallbackId,
    title: sanitizeString(input.title),
    type: sanitizeString(input.type),
    year: sanitizeString(input.year),
    img: sanitizeString(input.img),
  };
}

function normalizeContent(input = {}) {
  const beats = Array.isArray(input.beats) ? input.beats : DEFAULT_CONTENT.beats;
  const videos = Array.isArray(input.videos) ? input.videos : DEFAULT_CONTENT.videos;

  return {
    beats: beats.map((beat, index) => normalizeBeat(beat || {}, index + 1)),
    videos: videos.map((video, index) => normalizeVideo(video || {}, index + 1)),
    hero: {
      backgroundImg: sanitizeString(input.hero?.backgroundImg, DEFAULT_CONTENT.hero.backgroundImg),
      tagline: sanitizeString(input.hero?.tagline, DEFAULT_CONTENT.hero.tagline),
      bio: sanitizeString(input.hero?.bio, DEFAULT_CONTENT.hero.bio),
    },
    about: {
      photo: sanitizeString(input.about?.photo, DEFAULT_CONTENT.about.photo),
      bio1: sanitizeString(input.about?.bio1, DEFAULT_CONTENT.about.bio1),
      bio2: sanitizeString(input.about?.bio2, DEFAULT_CONTENT.about.bio2),
      bio3: sanitizeString(input.about?.bio3, DEFAULT_CONTENT.about.bio3),
    },
  };
}

async function getOrCreateContent() {
  let content = await ProdbyenneContent.findOne({ singletonKey: 'prodbyenne' });
  if (!content) {
    content = new ProdbyenneContent({ singletonKey: 'prodbyenne', ...DEFAULT_CONTENT });
    await content.save();
  }
  return content;
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  return next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const rawFolder = String(req.body?.folder || 'asset').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
    const ext = path.extname(file.originalname || '').slice(0, 10);
    const unique = crypto.randomBytes(8).toString('hex');
    cb(null, `${rawFolder}-${Date.now()}-${unique}${ext}`);
  },
});
const upload = multer({ storage });

router.get('/content', async (req, res) => {
  try {
    const content = await getOrCreateContent();
    return res.json({
      beats: content.beats,
      videos: content.videos,
      hero: content.hero,
      about: content.about,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load content', error: error.message });
  }
});

router.post('/content', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const content = await getOrCreateContent();
    const normalized = normalizeContent(req.body);
    content.beats = normalized.beats;
    content.videos = normalized.videos;
    content.hero = normalized.hero;
    content.about = normalized.about;
    await content.save();
    return res.json({
      beats: content.beats,
      videos: content.videos,
      hero: content.hero,
      about: content.about,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to save content', error: error.message });
  }
});

router.put('/content', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const content = await getOrCreateContent();
    const normalized = normalizeContent(req.body);
    content.beats = normalized.beats;
    content.videos = normalized.videos;
    content.hero = normalized.hero;
    content.about = normalized.about;
    await content.save();
    return res.json({
      beats: content.beats,
      videos: content.videos,
      hero: content.hero,
      about: content.about,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to save content', error: error.message });
  }
});

router.post('/beats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const content = await getOrCreateContent();
    const nextId = Math.max(0, ...content.beats.map((beat) => Number(beat.id) || 0)) + 1;
    const beat = normalizeBeat(req.body || {}, nextId);
    content.beats.push(beat);
    await content.save();
    return res.status(201).json(beat);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create beat', error: error.message });
  }
});

router.put('/beats/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const content = await getOrCreateContent();
    const beatId = Number(req.params.id);
    const index = content.beats.findIndex((beat) => Number(beat.id) === beatId);
    if (index === -1) {
      return res.status(404).json({ message: 'Beat not found' });
    }

    const current = content.beats[index].toObject();
    content.beats[index] = normalizeBeat({ ...current, ...(req.body || {}), id: beatId }, beatId);
    await content.save();
    return res.json(content.beats[index]);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update beat', error: error.message });
  }
});

router.delete('/beats/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const content = await getOrCreateContent();
    const beatId = Number(req.params.id);
    const initialLength = content.beats.length;
    content.beats = content.beats.filter((beat) => Number(beat.id) !== beatId);
    if (content.beats.length === initialLength) {
      return res.status(404).json({ message: 'Beat not found' });
    }
    await content.save();
    return res.json({ message: 'Beat deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete beat', error: error.message });
  }
});

router.post('/videos', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const content = await getOrCreateContent();
    const nextId = Math.max(0, ...content.videos.map((video) => Number(video.id) || 0)) + 1;
    const video = normalizeVideo(req.body || {}, nextId);
    content.videos.push(video);
    await content.save();
    return res.status(201).json(video);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create video', error: error.message });
  }
});

router.put('/videos/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const content = await getOrCreateContent();
    const videoId = Number(req.params.id);
    const index = content.videos.findIndex((video) => Number(video.id) === videoId);
    if (index === -1) {
      return res.status(404).json({ message: 'Video not found' });
    }

    const current = content.videos[index].toObject();
    content.videos[index] = normalizeVideo({ ...current, ...(req.body || {}), id: videoId }, videoId);
    await content.save();
    return res.json(content.videos[index]);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update video', error: error.message });
  }
});

router.delete('/videos/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const content = await getOrCreateContent();
    const videoId = Number(req.params.id);
    const initialLength = content.videos.length;
    content.videos = content.videos.filter((video) => Number(video.id) !== videoId);
    if (content.videos.length === initialLength) {
      return res.status(404).json({ message: 'Video not found' });
    }
    await content.save();
    return res.json({ message: 'Video deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete video', error: error.message });
  }
});

router.post('/bookings', async (req, res) => {
  try {
    const { name, email, service, message } = req.body || {};
    if (!name || !email || !service || !message) {
      return res.status(400).json({ message: 'Missing required booking fields' });
    }

    const booking = await Booking.create({ name, email, service, message });
    return res.status(201).json({
      id: String(booking._id),
      name: booking.name,
      email: booking.email,
      service: booking.service,
      message: booking.message,
      read: booking.read,
      createdAt: booking.createdAt,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create booking', error: error.message });
  }
});

router.get('/bookings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find({}).sort({ createdAt: -1 });
    return res.json(
      bookings.map((booking) => ({
        id: String(booking._id),
        name: booking.name,
        email: booking.email,
        service: booking.service,
        message: booking.message,
        read: booking.read,
        createdAt: booking.createdAt,
      }))
    );
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch bookings', error: error.message });
  }
});

router.put('/bookings/:id/read', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    return res.json({ message: 'Booking marked as read' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update booking', error: error.message });
  }
});

router.delete('/bookings/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const deleted = await Booking.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    return res.json({ message: 'Booking deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete booking', error: error.message });
  }
});

router.delete('/bookings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await Booking.deleteMany({});
    return res.json({ message: 'All bookings deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete bookings', error: error.message });
  }
});

router.post('/upload', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  return res.json({ url: `/uploads/${req.file.filename}` });
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id, 'username role');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ id: String(user._id), username: user.username, role: user.role });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to resolve user', error: error.message });
  }
});

module.exports = router;
