import { ApiError } from '../utils/ApiError.js';

export const errorMiddleware = (err, req, res, next) => {
  let error = err;

  // Handle express body-parser JSON syntax error
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    error = ApiError.badRequest('Malformed JSON in request body');
  }

  // Handle Mongoose Bad ObjectId / CastError
  if (err.name === 'CastError') {
    error = ApiError.badRequest(`Invalid ${err.path}: ${err.value}`);
  }

  // Handle Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    error = ApiError.conflict(`Duplicate value for '${field}'. Must be unique.`);
  }

  // Handle Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors || {}).map((e) => ({
      field: e.path,
      message: e.message
    }));
    error = ApiError.badRequest('Database validation failed', details);
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal Server Error';
  const errors = error.errors || [];

  const response = {
    success: false,
    statusCode,
    message,
    ...(errors.length > 0 && { errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  };

  // Log 500 errors to console
  if (statusCode >= 500) {
    console.error(`[Unhandled Error] ${req.method} ${req.originalUrl}:`, error);
  }

  res.status(statusCode).json(response);
};

