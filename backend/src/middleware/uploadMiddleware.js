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
 * Validates actual file magic numbers to verify real image contents.
 */
const validateFileHeader = (filePath) => {
  try {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);

    // JPEG: FF D8 FF
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    // WebP: RIFF .... WEBP
    const isWebp =
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP';

    return isJpeg || isPng || isWebp;
  } catch {
    return false;
  }
};

/**
 * Safely removes a file from disk.
 */
export const cleanupFile = (filePath) => {
  if (!filePath) return;
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(UPLOADS_DIR, path.basename(filePath));

  fs.unlink(fullPath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error(`Failed to delete file ${fullPath}:`, err.message);
    }
  });
};

/**
 * Safely removes multiple files from disk.
 */
export const cleanupFiles = (files) => {
  if (!Array.isArray(files)) return;
  files.forEach((f) => {
    if (!f) return;
    const target = typeof f === 'string' ? f : f.path || f.filename;
    cleanupFile(target);
  });
};

/**
 * Middleware for image uploads supporting up to 5 images per listing.
 * Accepts files under 'images', 'photos', 'image', or 'photo'.
 */
export const uploadListingImage = (req, res, next) => {
  const uploadFields = upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'photos', maxCount: 5 },
    { name: 'image', maxCount: 5 },
    { name: 'photo', maxCount: 5 }
  ]);

  uploadFields(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(ApiError.badRequest('File size exceeds the 5 MB limit.'));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
          return next(ApiError.badRequest('Maximum 5 images allowed per listing.'));
        }
        return next(ApiError.badRequest(`Upload error: ${err.message}`));
      }
      return next(err);
    }

    // Collect all uploaded files across accepted field names
    const allFiles = [
      ...(req.files?.images || []),
      ...(req.files?.photos || []),
      ...(req.files?.image || []),
      ...(req.files?.photo || [])
    ];

    if (allFiles.length > 5) {
      cleanupFiles(allFiles);
      return next(ApiError.badRequest('Maximum 5 images allowed per listing.'));
    }

    // Validate actual binary contents of each uploaded file
    for (const f of allFiles) {
      if (!validateFileHeader(f.path)) {
        cleanupFiles(allFiles);
        return next(
          ApiError.badRequest(
            'Invalid file content. Uploaded file is not a valid JPEG, PNG, or WebP image.'
          )
        );
      }
    }

    req.filesList = allFiles;
    req.file = allFiles[0] || null;
    req.uploadedPhotos = allFiles.map((f) => `/uploads/${f.filename}`);

    if (req.uploadedPhotos.length > 0) {
      req.body.photos = req.uploadedPhotos;
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
