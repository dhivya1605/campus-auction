import { apiClient } from './apiClient';

export const listingApi = {
  getListings: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, value);
      }
    });
    const queryString = query.toString();
    return apiClient.get(`/listings${queryString ? `?${queryString}` : ''}`);
  },

  getListingById: (id) => apiClient.get(`/listings/${id}`),

  createListing: (data) => apiClient.post('/listings', data, { requiresAuth: true }),

  updateListing: (id, data) => apiClient.patch(`/listings/${id}`, data, { requiresAuth: true }),

  cancelListing: (id) => apiClient.delete(`/listings/${id}`, { requiresAuth: true })
};

