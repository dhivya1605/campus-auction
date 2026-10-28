import apiClient from './apiClient';

export const notificationApi = {
  /**
   * Retrieves the current user's notifications.
   * @param {object} [params]
   * @param {boolean} [params.unreadOnly]
   * @param {number} [params.limit]
   */
  getMyNotifications: async ({ unreadOnly = false, limit = 30 } = {}) => {
    const query = new URLSearchParams();
    if (unreadOnly) query.append('unreadOnly', 'true');
    if (limit) query.append('limit', limit.toString());
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiClient.get(`/notifications${queryString}`, { requiresAuth: true });
  },

  /**
   * Lightweight poll endpoint for unread count + any new notifications since a timestamp.
   * @param {Date|string|null} since
   */
  getUnreadCount: async (since = null) => {
    const query = new URLSearchParams();
    if (since) {
      const iso = since instanceof Date ? since.toISOString() : since;
      query.append('since', iso);
    }
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return apiClient.get(`/notifications/unread-count${queryString}`, { requiresAuth: true });
  },

  /**
   * Marks a single notification as read.
   * @param {string} id
   */
  markAsRead: async (id) => {
    return apiClient.patch(`/notifications/${id}/read`, {}, { requiresAuth: true });
  },

  /**
   * Marks all unread notifications as read.
   */
  markAllAsRead: async () => {
    return apiClient.patch('/notifications/read-all', {}, { requiresAuth: true });
  }
};

export default notificationApi;

