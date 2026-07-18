const cloudinary = require('cloudinary').v2;

const hasCloudinaryConfig = () => (
  !!process.env.CLOUDINARY_CLOUD_NAME
  && !!process.env.CLOUDINARY_API_KEY
  && !!process.env.CLOUDINARY_API_SECRET
);

if (hasCloudinaryConfig()) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

const isCloudinaryReady = () => hasCloudinaryConfig();

const uploadImageFromPath = async (filePath, options = {}) => {
  if (!isCloudinaryReady()) {
    throw new Error('Cloudinary is not configured');
  }

  return cloudinary.uploader.upload(filePath, {
    folder: '3nn3twork/profile-images',
    resource_type: 'image',
    ...options,
  });
};

const deleteAssetByPublicId = async (publicId) => {
  if (!isCloudinaryReady() || !publicId) {
    return;
  }

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (error) {
    console.warn(`Cloudinary delete warning for ${publicId}: ${error.message}`);
  }
};

module.exports = {
  isCloudinaryReady,
  uploadImageFromPath,
  deleteAssetByPublicId,
};
