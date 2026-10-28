import { Router } from 'express';
import {
  triggerCloseExpiredAuctions,
  triggerCloseSingleAuction
} from '../controllers/auctionController.js';
import { authenticate, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

// Protected admin endpoint to close all expired auctions
router.post('/close-expired', authenticate, requireRole('admin'), triggerCloseExpiredAuctions);

// Close a single auction (admin or listing owner after closing time)
router.post('/:id/close', authenticate, triggerCloseSingleAuction);

export default router;

