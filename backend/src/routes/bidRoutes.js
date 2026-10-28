import { Router } from 'express';
import { placeBid, getListingBids } from '../controllers/bidController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { createBidValidator, getBidsValidator } from '../validators/bidValidators.js';

// Router with mergeParams: true allows accessing :id from parent listing router
const router = Router({ mergeParams: true });

router.post('/', authenticate, createBidValidator, placeBid);
router.get('/', getBidsValidator, getListingBids);

export default router;

