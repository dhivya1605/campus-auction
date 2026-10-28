import { Router } from 'express';
import {
  getSaleOutcome,
  approveWinningBid,
  rejectWinningBid,
  confirmHandover,
  recordFailedPickup,
  cancelSale
} from '../controllers/saleController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/:listingId', authenticate, getSaleOutcome);
router.post('/:listingId/approve', authenticate, approveWinningBid);
router.post('/:listingId/reject', authenticate, rejectWinningBid);
router.post('/:listingId/confirm-handover', authenticate, confirmHandover);
router.post('/:listingId/failed-pickup', authenticate, recordFailedPickup);
router.post('/:listingId/cancel', authenticate, cancelSale);

export default router;

