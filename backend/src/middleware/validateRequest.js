import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';
import { cleanupFile, cleanupFiles } from './uploadMiddleware.js';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    if (req.filesList && req.filesList.length > 0) {
      cleanupFiles(req.filesList);
    } else if (req.file) {
      cleanupFile(req.file.path);
    }
    const formattedErrors = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));
    return next(new ApiError(400, 'Validation failed for request parameters', formattedErrors));
  }
  next();
};

