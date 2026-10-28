import { Router } from 'express';
import {
  getSaleOutcome,
  getMyPurchases,
  approveWinningBid,
  rejectWinningBid,
  confirmHandover,
  recordFailedPickup,
  cancelSale
} from '../controllers/saleController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

// Buyer: fetch all purchases where authenticated user is the provisional winner
router.get('/my-purchases', authenticate, getMyPurchases);

// Seller/admin: fetch sale outcome for a specific listing
router.get('/:listingId', authenticate, getSaleOutcome);

router.post('/:listingId/approve', authenticate, approveWinningBid);
router.post('/:listingId/reject', authenticate, rejectWinningBid);
router.post('/:listingId/confirm-handover', authenticate, confirmHandover);
router.post('/:listingId/failed-pickup', authenticate, recordFailedPickup);
router.post('/:listingId/cancel', authenticate, cancelSale);

export default router;
