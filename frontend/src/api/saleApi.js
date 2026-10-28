import { apiClient } from './apiClient';

export const saleApi = {
  /** Buyer: list all my purchases (auctions where I am the provisional winner) */
  getMyPurchases: () => apiClient.get('/sales/my-purchases', { requiresAuth: true }),

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

  /** Buyer accepts purchase: calls the shared confirm-handover endpoint as the buyer */
  acceptPurchase: (listingId) =>
    apiClient.post(
      `/sales/${listingId}/confirm-handover`,
      { notes: 'Purchase accepted by buyer' },
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
