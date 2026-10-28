import { Router } from 'express';
import {
  getListingQuestions,
  askQuestion,
  answerQuestion
} from '../controllers/questionController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router({ mergeParams: true });

// Works for both /api/questions/listing/:listingId AND nested /api/listings/:id/questions
router.get('/', getListingQuestions);
router.post('/', authenticate, askQuestion);

router.get('/listing/:listingId', getListingQuestions);
router.post('/listing/:listingId', authenticate, askQuestion);
router.patch('/:id/answer', authenticate, answerQuestion);

export default router;

