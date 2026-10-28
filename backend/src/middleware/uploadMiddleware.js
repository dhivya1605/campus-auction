import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ApiError } from '../utils/ApiError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target: backend/uploads
export const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

// Ensure directory exists at runtime
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Allowed MIME types and extensions for images
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Unique collision-resistant filename without trusting client filename
    const uniqueName = `listing-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const isMimeValid = ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase());
  const isExtValid = ALLOWED_EXTENSIONS.includes(ext);

  if (isMimeValid && isExtValid) {
    cb(null, true);
  } else {
    cb(
      ApiError.badRequest(
        'Invalid file type. Only JPEG, PNG, and WebP images are allowed.'
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB per image
  }
});

/**
 * Middleware for single image upload with error handling and body normalization.
 * Accepts file under field name 'image' or 'photo'.
 */
export const uploadListingImage = (req, res, next) => {
  const uploadSingle = upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'photo', maxCount: 1 }
  ]);

  uploadSingle(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(ApiError.badRequest('File size exceeds the 5 MB limit.'));
        }
        return next(ApiError.badRequest(`Upload error: ${err.message}`));
      }
      return next(err);
    }

    // Assign req.file from either 'image' or 'photo' field
    if (req.files?.image?.[0]) {
      req.file = req.files.image[0];
    } else if (req.files?.photo?.[0]) {
      req.file = req.files.photo[0];
    }

    // If an image was uploaded, attach its relative path to req.body.photos
    if (req.file) {
      req.body.photos = [`/uploads/${req.file.filename}`];
    } else if (typeof req.body.photos === 'string') {
      try {
        const parsed = JSON.parse(req.body.photos);
        req.body.photos = Array.isArray(parsed) ? parsed : [req.body.photos];
      } catch {
        req.body.photos = [req.body.photos];
      }
    }

    next();
  });
};

/**
 * Safely removes a file from disk (e.g., if listing creation fails).
 */
export const cleanupFile = (filePath) => {
  if (!filePath) return;
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(UPLOADS_DIR, path.basename(filePath));

  fs.unlink(fullPath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error(`Failed to delete temporary file ${fullPath}:`, err.message);
    }
  });
};
