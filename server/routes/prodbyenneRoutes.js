const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const jwt = require('jsonwebtoken');

const authenticateToken = require('../middleware/auth');
const User = require('../models/User');
const Booking = require('../models/Booking');
const ProdbyenneContent = require('../models/ProdbyenneContent');
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

const DEFAULT_CONTENT = {
  beats: [],
  videos: [],
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

function sanitizeAssetMeta(input = {}) {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const provider = sanitizeString(input.provider).trim();
  const publicId = sanitizeString(input.publicId).trim();
  const resourceType = sanitizeString(input.resourceType).trim();
  const format = sanitizeString(input.format).trim();
  const bytes = Number(input.bytes) || 0;

  if (!provider && !publicId && !resourceType && !format && !bytes) {
    return undefined;
  }

  return {
    provider,
    publicId,
    resourceType,
    format,
    bytes,
  };
}

function resolveLegacyVideoUrl(input = {}) {
  const candidates = [
    input.videoUrl,
    input.url,
    input.src,
    input.fileUrl,
    input.video,
    input.mediaUrl,
  ];

  const match = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return sanitizeString(match || '');
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    audioMeta: sanitizeAssetMeta(input.audioMeta),
    comment: sanitizeString(input.comment),
  };
}

function normalizeVideo(input, fallbackId) {
  return {
    id: Number(input.id) || fallbackId,
    title: sanitizeString(input.title),
    type: sanitizeString(input.type),
    year: sanitizeString(input.year),
    img: sanitizeString(input.img),
    imgMeta: sanitizeAssetMeta(input.imgMeta),
    videoUrl: resolveLegacyVideoUrl(input),
    videoMeta: sanitizeAssetMeta(input.videoMeta),
    comment: sanitizeString(input.comment),
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
      backgroundImgMeta: sanitizeAssetMeta(input.hero?.backgroundImgMeta),
      tagline: sanitizeString(input.hero?.tagline, DEFAULT_CONTENT.hero.tagline),
      bio: sanitizeString(input.hero?.bio, DEFAULT_CONTENT.hero.bio),
    },
    about: {
      photo: sanitizeString(input.about?.photo, DEFAULT_CONTENT.about.photo),
      photoMeta: sanitizeAssetMeta(input.about?.photoMeta),
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

async function resolveBookingRequesterFromAuthHeader(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, 'secret_key');
    if (!payload?.id) {
      return null;
    }

    const user = await User.findById(payload.id, '_id username');
    if (!user) {
      return null;
    }

    return {
      requesterUser: user._id,
      requesterUsername: user.username,
    };
  } catch (error) {
    return null;
  }
}

function mapBooking(booking) {
  return {
    id: String(booking._id),
    name: booking.name,
    email: booking.email,
    requesterUser: booking.requesterUser ? String(booking.requesterUser) : null,
    requesterUsername: booking.requesterUsername || null,
    status: booking.status || 'pending',
    sessionDateTime: booking.sessionDateTime,
    service: booking.service,
    message: booking.message,
    read: booking.read,
    createdAt: booking.createdAt,
  };
}

function emitBookingCreated(booking) {
  if (!io) return;
  const payload = mapBooking(booking);
  io.to('admins').emit('booking_created', payload);

  if (payload.requesterUser) {
    io.to(payload.requesterUser).emit('booking_created', payload);
  }
}

function emitBookingUpdated(booking) {
  if (!io) return;
  const payload = mapBooking(booking);
  io.to('admins').emit('booking_updated', payload);

  if (payload.requesterUser) {
    io.to(payload.requesterUser).emit('booking_updated', payload);
  }
}

function emitBookingDeleted(booking) {
  if (!io) return;
  const payload = mapBooking(booking);
  io.to('admins').emit('booking_deleted', payload);

  if (payload.requesterUser) {
    io.to(payload.requesterUser).emit('booking_deleted', payload);
  }
}

function emitBookingsCleared() {
  if (!io) return;
  io.to('admins').emit('bookings_cleared');
}

function isAllowedUploadForFolder(folder, file) {
  const safeFolder = String(folder || '').toLowerCase();
  const ext = String(path.extname(file?.originalname || '') || '').toLowerCase();
  const mime = String(file?.mimetype || '').toLowerCase();
  const isGenericMime = !mime || mime === 'application/octet-stream';

  if (safeFolder === 'audio') {
    const allowedExt = new Set(['.mp3', '.wav']);
    const allowedMime = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave']);
    return allowedExt.has(ext) && (allowedMime.has(mime) || isGenericMime);
  }

  if (safeFolder === 'videos') {
    const allowedExt = new Set(['.mp4', '.mkv', '.mov', '.webm']);
    const allowedMime = new Set(['video/mp4', 'video/x-matroska', 'video/quicktime', 'video/webm']);
    return allowedExt.has(ext) && (allowedMime.has(mime) || isGenericMime);
  }

  return true;
}

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

function getCloudinaryFolderForUpload(rawFolder) {
  const safeFolder = String(rawFolder || 'asset').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'asset';
  return `3nn3twork/prodbyenne/${safeFolder}`;
}

function getCloudinaryResourceTypeForUpload(rawFolder) {
  const safeFolder = String(rawFolder || '').toLowerCase();
  if (safeFolder === 'audio' || safeFolder === 'videos') {
    return 'video';
  }
  return 'image';
}

function resolveLocalUploadPathFromUrl(urlValue) {
  const normalized = String(urlValue || '').trim();
  if (!normalized.startsWith('/uploads/')) {
    return '';
  }

  const fileName = normalized.slice('/uploads/'.length);
  if (!fileName) {
    return '';
  }

  return path.join(__dirname, '..', 'uploads', fileName);
}

function isCloudinaryAsset(asset) {
  return String(asset?.meta?.provider || '').toLowerCase() === 'cloudinary' && String(asset?.meta?.publicId || '').trim();
}

function isLocalUploadAsset(asset) {
  const provider = String(asset?.meta?.provider || '').toLowerCase();
  const url = String(asset?.url || '').trim();

  if (provider === 'local') {
    return true;
  }

  return url.startsWith('/uploads/');
}

function getAssetIdentity(asset) {
  const provider = String(asset?.meta?.provider || '').toLowerCase();
  const publicId = String(asset?.meta?.publicId || '').trim();
  const url = String(asset?.url || '').trim();

  if (provider === 'cloudinary' && publicId) {
    return `cloudinary:${publicId}`;
  }

  if (provider === 'local' && url) {
    return `local:${url}`;
  }

  if (url.startsWith('/uploads/')) {
    return `local:${url}`;
  }

  return url ? `url:${url}` : '';
}

function collectTrackedAssets(contentLike = {}) {
  const assets = [];

  const beats = Array.isArray(contentLike.beats) ? contentLike.beats : [];
  beats.forEach((beat) => {
    assets.push({
      url: beat?.audioUrl,
      meta: beat?.audioMeta,
    });
  });

  const videos = Array.isArray(contentLike.videos) ? contentLike.videos : [];
  videos.forEach((video) => {
    assets.push({
      url: video?.img,
      meta: video?.imgMeta,
    });
    assets.push({
      url: video?.videoUrl,
      meta: video?.videoMeta,
    });
  });

  assets.push({
    url: contentLike.hero?.backgroundImg,
    meta: contentLike.hero?.backgroundImgMeta,
  });

  assets.push({
    url: contentLike.about?.photo,
    meta: contentLike.about?.photoMeta,
  });

  return assets.filter((asset) => String(asset?.url || '').trim().length > 0);
}

async function cleanupRemovedAssets(previousContent = {}, nextContent = {}) {
  const previousAssets = collectTrackedAssets(previousContent);
  const nextAssets = collectTrackedAssets(nextContent);
  const nextIdentities = new Set(nextAssets.map(getAssetIdentity).filter(Boolean));

  for (const asset of previousAssets) {
    const identity = getAssetIdentity(asset);
    if (!identity || nextIdentities.has(identity)) {
      continue;
    }

    try {
      if (isCloudinaryAsset(asset)) {
        await deleteAssetByPublicId(asset.meta.publicId);
        continue;
      }

      if (isLocalUploadAsset(asset)) {
        const localPath = resolveLocalUploadPathFromUrl(asset.url);
        if (localPath) {
          await removeLocalFileIfExists(localPath);
        }
      }
    } catch (error) {
      console.warn(`Asset cleanup warning for ${identity}: ${error.message}`);
    }
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDirExists();
    cb(null, uploadDir);
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
    const normalized = normalizeContent(content.toObject());

    // Persist a one-time migration for legacy video URL keys.
    const hadLegacyVideoUrls = normalized.videos.some((video, index) => {
      const current = content.videos[index];
      return current && String(current.videoUrl || '').trim() !== String(video.videoUrl || '').trim();
    });

    if (hadLegacyVideoUrls) {
      content.videos = normalized.videos;
      await content.save();
    }

    return res.json({
      beats: normalized.beats,
      videos: normalized.videos,
      hero: normalized.hero,
      about: normalized.about,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load content', error: error.message });
  }
});

router.post('/content', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const content = await getOrCreateContent();
    const previousContent = content.toObject();
    const normalized = normalizeContent(req.body);
    content.beats = normalized.beats;
    content.videos = normalized.videos;
    content.hero = normalized.hero;
    content.about = normalized.about;
    await content.save();
    await cleanupRemovedAssets(previousContent, content.toObject());
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
    const previousContent = content.toObject();
    const normalized = normalizeContent(req.body);
    content.beats = normalized.beats;
    content.videos = normalized.videos;
    content.hero = normalized.hero;
    content.about = normalized.about;
    await content.save();
    await cleanupRemovedAssets(previousContent, content.toObject());
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
    const previousContent = content.toObject();
    const beatId = Number(req.params.id);
    const index = content.beats.findIndex((beat) => Number(beat.id) === beatId);
    if (index === -1) {
      return res.status(404).json({ message: 'Beat not found' });
    }

    const current = content.beats[index].toObject();
    content.beats[index] = normalizeBeat({ ...current, ...(req.body || {}), id: beatId }, beatId);
    await content.save();
    await cleanupRemovedAssets(previousContent, content.toObject());
    return res.json(content.beats[index]);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update beat', error: error.message });
  }
});

router.delete('/beats/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const content = await getOrCreateContent();
    const previousContent = content.toObject();
    const beatId = Number(req.params.id);
    const initialLength = content.beats.length;
    content.beats = content.beats.filter((beat) => Number(beat.id) !== beatId);
    if (content.beats.length === initialLength) {
      return res.status(404).json({ message: 'Beat not found' });
    }
    await content.save();
    await cleanupRemovedAssets(previousContent, content.toObject());
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
    const previousContent = content.toObject();
    const videoId = Number(req.params.id);
    const index = content.videos.findIndex((video) => Number(video.id) === videoId);
    if (index === -1) {
      return res.status(404).json({ message: 'Video not found' });
    }

    const current = content.videos[index].toObject();
    content.videos[index] = normalizeVideo({ ...current, ...(req.body || {}), id: videoId }, videoId);
    await content.save();
    await cleanupRemovedAssets(previousContent, content.toObject());
    return res.json(content.videos[index]);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update video', error: error.message });
  }
});

router.delete('/videos/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const content = await getOrCreateContent();
    const previousContent = content.toObject();
    const videoId = Number(req.params.id);
    const initialLength = content.videos.length;
    content.videos = content.videos.filter((video) => Number(video.id) !== videoId);
    if (content.videos.length === initialLength) {
      return res.status(404).json({ message: 'Video not found' });
    }
    await content.save();
    await cleanupRemovedAssets(previousContent, content.toObject());
    return res.json({ message: 'Video deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete video', error: error.message });
  }
});

router.post('/bookings', async (req, res) => {
  try {
    const { name, email, service, message, sessionDateTime } = req.body || {};
    if (!name || !email || !service || !message || !sessionDateTime) {
      return res.status(400).json({ message: 'Missing required booking fields' });
    }

    const parsedSessionDateTime = new Date(sessionDateTime);
    if (Number.isNaN(parsedSessionDateTime.getTime())) {
      return res.status(400).json({ message: 'Invalid booking date/time' });
    }

    const conflictingAcceptedBooking = await Booking.findOne({
      status: 'accepted',
      sessionDateTime: parsedSessionDateTime,
    });

    if (conflictingAcceptedBooking) {
      return res.status(409).json({
        message: 'This session date/time has already been accepted. Please choose another slot.',
      });
    }

    const requester = await resolveBookingRequesterFromAuthHeader(req);

    const booking = await Booking.create({
      name,
      email,
      service,
      message,
      sessionDateTime: parsedSessionDateTime,
      requesterUser: requester?.requesterUser,
      requesterUsername: requester?.requesterUsername,
    });
    emitBookingCreated(booking);
    return res.status(201).json(mapBooking(booking));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create booking', error: error.message });
  }
});

router.get('/bookings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const bookings = await Booking.find({}).sort({ createdAt: -1 });
    return res.json(bookings.map(mapBooking));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch bookings', error: error.message });
  }
});

router.get('/bookings/my', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id, '_id username email');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const normalizedEmail = String(user.email || '').trim().toLowerCase();
    if (normalizedEmail) {
      const emailRegex = new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i');

      await Booking.updateMany(
        {
          email: emailRegex,
          $or: [
            { requesterUser: null },
            { requesterUser: { $exists: false } },
          ],
        },
        {
          $set: {
            requesterUser: user._id,
            requesterUsername: user.username,
          },
        }
      );
    }

    const bookings = await Booking.find({ requesterUser: user._id }).sort({ createdAt: -1 });
    return res.json(bookings.map(mapBooking));
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
    emitBookingUpdated(booking);
    return res.json({ message: 'Booking marked as read' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update booking', error: error.message });
  }
});

router.put('/bookings/:id/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const requestedStatus = String(req.body?.status || '').toLowerCase();
    if (!['accepted', 'rejected'].includes(requestedStatus)) {
      return res.status(400).json({ message: 'Status must be accepted or rejected' });
    }

    const existingBooking = await Booking.findById(req.params.id);
    if (!existingBooking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (requestedStatus === 'accepted') {
      const conflictingAcceptedBooking = await Booking.findOne({
        _id: { $ne: existingBooking._id },
        status: 'accepted',
        sessionDateTime: existingBooking.sessionDateTime,
      });

      if (conflictingAcceptedBooking) {
        return res.status(409).json({
          message: 'Another booking is already accepted for this session date/time.',
        });
      }
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: requestedStatus, read: true },
      { new: true }
    );

    emitBookingUpdated(booking);
    return res.json(mapBooking(booking));
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update booking status', error: error.message });
  }
});

router.delete('/bookings/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const deleted = await Booking.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    emitBookingDeleted(deleted);
    return res.json({ message: 'Booking deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete booking', error: error.message });
  }
});

router.delete('/bookings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await Booking.deleteMany({});
    emitBookingsCleared();
    return res.json({ message: 'All bookings deleted' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete bookings', error: error.message });
  }
});

router.post('/upload', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!isAllowedUploadForFolder(req.body?.folder, req.file)) {
      await removeLocalFileIfExists(req.file.path);
      return res.status(400).json({ error: 'Unsupported file type for selected media folder' });
    }

    if (isCloudinaryReady()) {
      const uploadResult = await uploadImageFromPath(req.file.path, {
        folder: getCloudinaryFolderForUpload(req.body?.folder),
        resource_type: getCloudinaryResourceTypeForUpload(req.body?.folder),
      });

      await removeLocalFileIfExists(req.file.path);

      return res.json({
        url: uploadResult.secure_url,
        meta: {
          provider: 'cloudinary',
          publicId: uploadResult.public_id,
          resourceType: uploadResult.resource_type,
          format: uploadResult.format,
          bytes: uploadResult.bytes,
        },
      });
    }

    return res.json({
      url: `/uploads/${req.file.filename}`,
      meta: {
        provider: 'local',
        publicId: req.file.filename,
        resourceType: getCloudinaryResourceTypeForUpload(req.body?.folder),
        format: path.extname(req.file.filename).replace('.', ''),
        bytes: req.file.size,
      },
    });
  } catch (error) {
    if (req.file?.path) {
      await removeLocalFileIfExists(req.file.path);
    }

    return res.status(500).json({ error: 'Upload failed', message: error.message });
  }
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

return router;
};
