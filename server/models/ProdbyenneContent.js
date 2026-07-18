const mongoose = require('mongoose');

const AssetMetaSchema = new mongoose.Schema(
  {
    provider: { type: String, default: '' },
    publicId: { type: String, default: '' },
    resourceType: { type: String, default: '' },
    format: { type: String, default: '' },
    bytes: { type: Number, default: 0 },
  },
  { _id: false }
);

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
    audioMeta: { type: AssetMetaSchema, default: undefined },
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
    imgMeta: { type: AssetMetaSchema, default: undefined },
    videoUrl: { type: String, default: '' },
    videoMeta: { type: AssetMetaSchema, default: undefined },
    comment: { type: String, default: '' },
  },
  { _id: false }
);

const HeroSchema = new mongoose.Schema(
  {
    backgroundImg: { type: String, default: '' },
    backgroundImgMeta: { type: AssetMetaSchema, default: undefined },
    tagline: { type: String, default: '' },
    bio: { type: String, default: '' },
  },
  { _id: false }
);

const AboutSchema = new mongoose.Schema(
  {
    photo: { type: String, default: '' },
    photoMeta: { type: AssetMetaSchema, default: undefined },
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
