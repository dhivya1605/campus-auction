import { Router } from 'express';
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
} from '../controllers/notificationController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// GET /api/notifications — full list for the logged-in user
router.get('/', getMyNotifications);

// GET /api/notifications/unread-count — lightweight poll endpoint
router.get('/unread-count', getUnreadCount);

// PATCH /api/notifications/read-all — mark every unread as read
router.patch('/read-all', markAllAsRead);

// PATCH /api/notifications/:id/read — mark one as read
router.patch('/:id/read', markAsRead);

export default router;

