import jwt from 'jsonwebtoken';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Authentication required. Missing or malformed Bearer token.');
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'hackathon_default_secret_key_change_in_production';

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw ApiError.unauthorized('Token has expired. Please log in again.');
      }
      throw ApiError.unauthorized('Invalid authentication token.');
    }

    const user = await User.findById(decoded.id).select('+role');
    if (!user) {
      throw ApiError.unauthorized('User associated with this token no longer exists.');
    }

    // Attach authenticated user to request - NEVER trust body user IDs
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication: attaches user if valid token present, but does not block if absent.
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const secret = process.env.JWT_SECRET || 'hackathon_default_secret_key_change_in_production';
      try {
        const decoded = jwt.verify(token, secret);
        const user = await User.findById(decoded.id);
        if (user) {
          req.user = user;
        }
      } catch {
        // Ignore invalid token in optional mode
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Restricts route to specific roles (e.g. 'admin')
 */
export const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required.'));
    }
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Access denied. Insufficient permissions.'));
    }
    next();
  };
};

