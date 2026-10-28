import { body, query, param } from 'express-validator';
import { LISTING_CATEGORIES, LISTING_CONDITIONS, LISTING_STATUSES } from '../models/Listing.js';
import { validateRequest } from '../middleware/validateRequest.js';

export const createListingValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 3, max: 120 })
    .withMessage('Title must be between 3 and 120 characters'),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Category is required')
    .isIn(LISTING_CATEGORIES)
    .withMessage(`Category must be one of: ${LISTING_CATEGORIES.join(', ')}`),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Description is required')
    .isLength({ min: 10, max: 3000 })
    .withMessage('Description must be between 10 and 3000 characters'),
  body('condition')
    .trim()
    .notEmpty()
    .withMessage('Condition is required')
    .isIn(LISTING_CONDITIONS)
    .withMessage(`Condition must be one of: ${LISTING_CONDITIONS.join(', ')}`),
  body('photos')
    .optional()
    .customSanitizer((val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [val];
        } catch {
          return [val];
        }
      }
      return [];
    }),
  body('startingPrice')
    .notEmpty()
    .withMessage('Starting price is required')
    .isInt({ min: 0 })
    .withMessage('Starting price must be a non-negative integer (rupees)'),
  body('minimumBidIncrement')
    .notEmpty()
    .withMessage('Minimum bid increment is required')
    .isInt({ min: 1 })
    .withMessage('Minimum bid increment must be a positive integer of at least 1 rupee'),
  body('startTime')
    .optional()
    .isISO8601()
    .withMessage('Start time must be a valid ISO 8601 date string')
    .toDate(),
  body('closingTime')
    .notEmpty()
    .withMessage('Closing time is required')
    .isISO8601()
    .withMessage('Closing time must be a valid ISO 8601 date string')
    .toDate()
    .custom((closingTime, { req }) => {
      const start = req.body.startTime ? new Date(req.body.startTime) : new Date();
      if (new Date(closingTime) <= start) {
        throw new Error('Closing time must be strictly after the auction start time');
      }
      return true;
    }),
  validateRequest
];

export const updateListingValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid listing ID format'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 3, max: 120 })
    .withMessage('Title must be between 3 and 120 characters'),
  body('category')
    .optional()
    .isIn(LISTING_CATEGORIES)
    .withMessage(`Category must be one of: ${LISTING_CATEGORIES.join(', ')}`),
  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 3000 })
    .withMessage('Description must be between 10 and 3000 characters'),
  body('condition')
    .optional()
    .isIn(LISTING_CONDITIONS)
    .withMessage(`Condition must be one of: ${LISTING_CONDITIONS.join(', ')}`),
  body('photos')
    .optional()
    .customSanitizer((val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [val];
        } catch {
          return [val];
        }
      }
      return [];
    }),
  body('startingPrice')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Starting price must be a non-negative integer (rupees)'),
  body('minimumBidIncrement')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Minimum bid increment must be a positive integer'),
  body('closingTime')
    .optional()
    .isISO8601()
    .withMessage('Closing time must be a valid ISO 8601 date string')
    .toDate(),
  validateRequest
];

export const getListingsQueryValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),
  query('category')
    .optional()
    .isIn(LISTING_CATEGORIES)
    .withMessage(`Category must be one of: ${LISTING_CATEGORIES.join(', ')}`),
  query('condition')
    .optional()
    .isIn(LISTING_CONDITIONS)
    .withMessage(`Condition must be one of: ${LISTING_CONDITIONS.join(', ')}`),
  query('status')
    .optional()
    .isIn(LISTING_STATUSES)
    .withMessage(`Status must be one of: ${LISTING_STATUSES.join(', ')}`),
  query('minPrice')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum price must be a non-negative integer')
    .toInt(),
  query('maxPrice')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Maximum price must be a non-negative integer')
    .toInt(),
  query('closingSoon')
    .optional()
    .isBoolean()
    .withMessage('closingSoon must be true or false')
    .toBoolean(),
  query('sort')
    .optional()
    .isIn(['newest', 'price_asc', 'price_desc', 'closing_soon'])
    .withMessage('Sort must be one of: newest, price_asc, price_desc, closing_soon'),
  validateRequest
];

