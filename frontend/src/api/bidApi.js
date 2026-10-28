import { apiClient } from './apiClient';

export const bidApi = {
  placeBid: (listingId, amount) =>
    apiClient.post(`/listings/${listingId}/bids`, { amount }, { requiresAuth: true }),

  getListingBids: (listingId) => apiClient.get(`/listings/${listingId}/bids`)
};

