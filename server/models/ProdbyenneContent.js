const mongoose = require('mongoose');

const BeatSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    title: { type: String, default: '' },
    genre: { type: String, default: '' },
    bpm: { type: Number, default: 0 },
    key: { type: String, default: '' },
    duration: { type: String, default: '' },
    plays: { type: String, default: '0' },
    audioUrl: { type: String, default: '' },
    comment: { type: String, default: '' },
  },
  { _id: false }
);

const VideoSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true },
    title: { type: String, default: '' },
    type: { type: String, default: '' },
    year: { type: String, default: '' },
    img: { type: String, default: '' },
    videoUrl: { type: String, default: '' },
    comment: { type: String, default: '' },
  },
  { _id: false }
);

const HeroSchema = new mongoose.Schema(
  {
    backgroundImg: { type: String, default: '' },
    tagline: { type: String, default: '' },
    bio: { type: String, default: '' },
  },
  { _id: false }
);

const AboutSchema = new mongoose.Schema(
  {
    photo: { type: String, default: '' },
    bio1: { type: String, default: '' },
    bio2: { type: String, default: '' },
    bio3: { type: String, default: '' },
  },
  { _id: false }
);

const ProdbyenneContentSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, required: true, unique: true, default: 'prodbyenne' },
    beats: { type: [BeatSchema], default: [] },
    videos: { type: [VideoSchema], default: [] },
    hero: { type: HeroSchema, required: true },
    about: { type: AboutSchema, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProdbyenneContent', ProdbyenneContentSchema);
