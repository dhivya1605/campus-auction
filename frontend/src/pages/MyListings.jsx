import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getImageUrl, PLACEHOLDER_IMAGE } from '../utils/imageUrl';
import { listingApi } from '../api/listingApi';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';

export const MyListings = () => {
  const { user } = useAuth();
  const [myListings, setMyListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const fetchMyListings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Fetch listings with limit 100
      const res = await listingApi.getListings({ limit: 100 });
      const all = res.listings || [];
      // Filter for current user's items
      const mine = all.filter((item) => {
        const sellerId = item.seller?._id || item.seller?.id || item.seller;
        return sellerId && user && sellerId.toString() === user.id.toString();
      });
      setMyListings(mine);
    } catch (err) {
      setError(err.message || 'Failed to fetch your listings');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMyListings();
  }, [fetchMyListings]);

  // Seller approves winning bid
  const handleApprove = async (listingId) => {
    try {
      setProcessingId(listingId);
      setActionSuccess(null);
      setError(null);
      await saleApi.approveWinningBid(listingId, 'Approved by seller via dashboard');
      setActionSuccess('Winning bid approved! Item is now reserved for campus handover.');
      await fetchMyListings();
    } catch (err) {
      setError(err.message || 'Failed to approve bid');
    } finally {
      setProcessingId(null);
    }
  };

  // Seller rejects winning bid
  const handleReject = async (listingId) => {
    const reason = window.prompt('Please enter the reason for rejecting this winning bid:') || 'Seller rejected price';
    try {
      setProcessingId(listingId);
      setActionSuccess(null);
      setError(null);
      await saleApi.rejectWinningBid(listingId, reason);
      setActionSuccess('Winning bid rejected. The auction outcome is marked as rejected.');
      await fetchMyListings();
    } catch (err) {
      setError(err.message || 'Failed to reject bid');
    } finally {
      setProcessingId(null);
    }
  };

  // Seller confirms physical handover
  const handleConfirmHandover = async (listingId) => {
    const location = window.prompt('Handover location (e.g. Campus Library, Hostel 2 Gate):') || 'Campus Handover';
    try {
      setProcessingId(listingId);
      setActionSuccess(null);
      setError(null);
      const res = await saleApi.confirmHandover(listingId, { location, notes: 'Handover confirmed by seller' });
      setActionSuccess(res.message || 'Handover confirmed successfully.');
      await fetchMyListings();
    } catch (err) {
      setError(err.message || 'Failed to confirm handover');
    } finally {
      setProcessingId(null);
    }
  };

  // Seller reports failed pickup
  const handleFailedPickup = async (listingId) => {
    const reason = window.prompt('Reason for failed pickup (e.g. buyer no-show after 48h):') || 'Buyer failed to appear';
    try {
      setProcessingId(listingId);
      setActionSuccess(null);
      setError(null);
      await saleApi.recordFailedPickup(listingId, reason);
      setActionSuccess('Failed pickup recorded. Listing closed as failed_pickup.');
      await fetchMyListings();
    } catch (err) {
      setError(err.message || 'Failed to record failed pickup');
    } finally {
      setProcessingId(null);
    }
  };

  // Seller cancels auction
  const handleCancelAuction = async (listingId) => {
    if (!window.confirm('Are you sure you want to cancel this auction? Bid history will be preserved.')) {
      return;
    }
    try {
      setProcessingId(listingId);
      setActionSuccess(null);
      setError(null);
      await listingApi.cancelListing(listingId);
      setActionSuccess('Auction cancelled successfully.');
      await fetchMyListings();
    } catch (err) {
      setError(err.message || 'Failed to cancel listing');
    } finally {
      setProcessingId(null);
    }
  };

  // Close expired auction
  const handleCloseAuction = async (listingId) => {
    try {
      setProcessingId(listingId);
      setActionSuccess(null);
      setError(null);
      await saleApi.closeAuction(listingId);
      setActionSuccess('Auction closed and outcome generated.');
      await fetchMyListings();
    } catch (err) {
      setError(err.message || 'Failed to close auction');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Seller Dashboard</h1>
          <p className="page-subtitle">
            Manage your listed items, approve winning bids, and confirm campus handovers.
          </p>
        </div>
        <Link to="/create-listing" className="btn btn-primary">
          + Create New Auction
        </Link>
      </div>

      {actionSuccess && <div className="alert alert-success">{actionSuccess}</div>}
      {error && <ErrorMessage message={error} onRetry={fetchMyListings} />}

      {loading ? (
        <Loading message="Loading your dashboard listings..." />
      ) : myListings.length === 0 ? (
        <div className="state-container">
          <h2 className="empty-title">You Haven't Listed Any Items Yet</h2>
          <p className="empty-text">
            Got an old cycle, textbook, or electronics? Put it up for auction in under 2 minutes!
          </p>
          <Link to="/create-listing" className="btn btn-primary">
            Create First Listing
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {myListings.map((item) => {
            const isProcessing = processingId === item._id;
            const isExpired = new Date(item.closingTime).getTime() <= new Date().getTime();

            return (
              <div
                key={item._id}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}
              >
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <img
                    src={item.photos?.[0] || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80'}
                    alt={item.title}
                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                  />
                  <div>
                    <Link to={`/listings/${item._id}`} style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                      {item.title}
                    </Link>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className={`badge badge-status-${item.status}`}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Current Price: <strong style={{ color: 'var(--primary)' }}>₹{item.currentPrice.toLocaleString('en-IN')}</strong>
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Closes: {new Date(item.closingTime).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status-based Action Controls */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {item.status === 'awaiting_seller_decision' && (
                    <>
                      <button
                        onClick={() => handleApprove(item._id)}
                        disabled={isProcessing}
                        className="btn btn-success"
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                      >
                        Approve Bid (Reserve Item)
                      </button>
                      <button
                        onClick={() => handleReject(item._id)}
                        disabled={isProcessing}
                        className="btn btn-danger"
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                      >
                        Reject Bid
                      </button>
                    </>
                  )}

                  {item.status === 'reserved' && (
                    <>
                      <button
                        onClick={() => handleConfirmHandover(item._id)}
                        disabled={isProcessing}
                        className="btn btn-primary"
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                      >
                        Confirm Campus Handover
                      </button>
                      <button
                        onClick={() => handleFailedPickup(item._id)}
                        disabled={isProcessing}
                        className="btn btn-danger"
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                      >
                        Report Failed Pickup
                      </button>
                    </>
                  )}

                  {(item.status === 'active' || item.status === 'scheduled') && (
                    <>
                      {isExpired && (
                        <button
                          onClick={() => handleCloseAuction(item._id)}
                          disabled={isProcessing}
                          className="btn btn-primary"
                          style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                        >
                          Close Expired Auction
                        </button>
                      )}
                      <button
                        onClick={() => handleCancelAuction(item._id)}
                        disabled={isProcessing}
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem', color: 'var(--danger)' }}
                      >
                        Cancel Auction
                      </button>
                    </>
                  )}

                  <Link
                    to={`/listings/${item._id}`}
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                  >
                    View Details
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyListings;

