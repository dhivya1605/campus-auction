import { Notification } from '../models/Notification.js';
import { ApiError } from '../utils/ApiError.js';
import mongoose from 'mongoose';

const MAX_NOTIFICATIONS_PER_PAGE = 50;

/**
 * GET /api/notifications
 * Returns the authenticated user's notifications, newest first.
 * Supports ?unreadOnly=true and ?limit=N query params.
 */
export const getMyNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = Math.min(
      parseInt(req.query.limit, 10) || 30,
      MAX_NOTIFICATIONS_PER_PAGE
    );

    const filter = { recipient: userId };
    if (unreadOnly) filter.isRead = false;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('-__v -idempotencyKey')
        .lean(),
      Notification.countDocuments({ recipient: userId, isRead: false })
    ]);

    res.status(200).json({
      success: true,
      unreadCount,
      count: notifications.length,
      notifications
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/notifications/unread-count
 * Lightweight endpoint used by the polling mechanism.
 * Returns only the unread count + newest unseen notifications since a given timestamp.
 */
export const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const since = req.query.since ? new Date(req.query.since) : null;

    const filter = { recipient: userId, isRead: false };
    if (since && !isNaN(since)) {
      filter.createdAt = { $gt: since };
    }

    const [unreadCount, newNotifications] = await Promise.all([
      Notification.countDocuments({ recipient: userId, isRead: false }),
      since
        ? Notification.find(filter)
            .sort({ createdAt: -1 })
            .limit(10)
            .select('-__v -idempotencyKey')
            .lean()
        : Promise.resolve([])
    ]);

    res.status(200).json({
      success: true,
      unreadCount,
      newNotifications
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read. Only the owning user may do this.
 */
export const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw ApiError.badRequest('Invalid notification ID');
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipient: userId }, // recipient check prevents reading another user's notification
      { isRead: true },
      { new: true }
    ).select('-__v -idempotencyKey');

    if (!notification) {
      throw ApiError.notFound('Notification not found');
    }

    res.status(200).json({ success: true, notification });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Marks all of the authenticated user's unread notifications as read.
 */
export const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const result = await Notification.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true }
    );

    res.status(200).json({
      success: true,
      markedCount: result.modifiedCount
    });
  } catch (error) {
    next(error);
  }
};

