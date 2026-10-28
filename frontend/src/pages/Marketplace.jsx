import React, { useState, useEffect, useCallback } from 'react';
import { listingApi } from '../api/listingApi';
import ListingCard from '../components/ListingCard';
import SearchFilters from '../components/SearchFilters';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';

export const Marketplace = () => {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    category: '',
    condition: '',
    sort: 'newest',
    closingSoon: false
  });

  const fetchListings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listingApi.getListings(filters);
      setListings(data.listings || []);
    } catch (err) {
      setError(err.message || 'Failed to load listings from backend');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handleResetFilters = () => {
    setFilters({
      search: '',
      category: '',
      condition: '',
      sort: 'newest',
      closingSoon: false
    });
  };

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Campus Marketplace</h1>
        <p className="page-subtitle">
          Buy and sell verified second-hand items across your campus community.
        </p>
      </div>

      <SearchFilters
        filters={filters}
        onChange={setFilters}
        onReset={handleResetFilters}
      />

      {error && <ErrorMessage message={error} onRetry={fetchListings} />}

      {loading ? (
        <Loading message="Fetching live auctions from server..." />
      ) : listings.length === 0 ? (
        <div className="state-container">
          <h2 className="empty-title">No Listings Found</h2>
          <p className="empty-text">
            No items matched your current search filters. Try clearing filters or create a new auction!
          </p>
          <button onClick={handleResetFilters} className="btn btn-primary">
            Clear Filters
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Showing {listings.length} item{listings.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="listings-grid">
            {listings.map((item) => (
              <ListingCard key={item._id} listing={item} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Marketplace;

