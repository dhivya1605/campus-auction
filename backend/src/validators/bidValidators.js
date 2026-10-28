import { body, param } from 'express-validator';
import { validateRequest } from '../middleware/validateRequest.js';

export const createBidValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid listing ID format'),
  body('amount')
    .notEmpty()
    .withMessage('Bid amount is required')
    .isInt({ min: 1 })
    .withMessage('Bid amount must be a positive integer in rupees'),
  validateRequest
];

export const getBidsValidator = [
  param('id')
    .isMongoId()
    .withMessage('Invalid listing ID format'),
  validateRequest
];

