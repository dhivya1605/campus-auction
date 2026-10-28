import { Router } from 'express';
import {
  createListing,
  getListings,
  getListingById,
  updateListing,
  cancelListing
} from '../controllers/listingController.js';
import bidRoutes from './bidRoutes.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { uploadListingImage } from '../middleware/uploadMiddleware.js';
import {
  createListingValidator,
  updateListingValidator,
  getListingsQueryValidator
} from '../validators/listingValidators.js';

const router = Router();

// Nested route for bids: /api/listings/:id/bids
router.use('/:id/bids', bidRoutes);

router.post('/', authenticate, uploadListingImage, createListingValidator, createListing);
router.get('/', getListingsQueryValidator, getListings);
router.get('/:id', getListingById);
router.patch('/:id', authenticate, uploadListingImage, updateListingValidator, updateListing);
router.delete('/:id', authenticate, cancelListing);

export default router;

