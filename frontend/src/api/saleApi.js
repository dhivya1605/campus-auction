import { apiClient } from './apiClient';

export const saleApi = {
  getSaleOutcome: (listingId) =>
    apiClient.get(`/sales/${listingId}`, { requiresAuth: true }),

  approveWinningBid: (listingId, note = '') =>
    apiClient.post(`/sales/${listingId}/approve`, { note }, { requiresAuth: true }),

  rejectWinningBid: (listingId, reason = '') =>
    apiClient.post(`/sales/${listingId}/reject`, { reason }, { requiresAuth: true }),

  confirmHandover: (listingId, { location = '', notes = '' } = {}) =>
    apiClient.post(
      `/sales/${listingId}/confirm-handover`,
      { location, notes },
      { requiresAuth: true }
    ),

  recordFailedPickup: (listingId, reason = '') =>
    apiClient.post(
      `/sales/${listingId}/failed-pickup`,
      { reason },
      { requiresAuth: true }
    ),

  cancelSale: (listingId, reason = '') =>
    apiClient.post(`/sales/${listingId}/cancel`, { reason }, { requiresAuth: true }),

  closeAuction: (listingId) =>
    apiClient.post(`/auctions/${listingId}/close`, {}, { requiresAuth: true })
};

