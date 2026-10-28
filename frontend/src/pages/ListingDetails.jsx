import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { listingApi } from '../api/listingApi';
import { bidApi } from '../api/bidApi';
import { saleApi } from '../api/saleApi';
import { useAuth } from '../context/AuthContext';
import CountdownTimer from '../components/CountdownTimer';
import BidHistory from '../components/BidHistory';
import Loading from '../components/Loading';
import { getImageUrl, PLACEHOLDER_IMAGE } from '../utils/imageUrl';

export const ListingDetails = () => {
  const { id } = useParams();
  const { user, isAuthenticated } = useAuth();

  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Bidding form states
  const [bidAmount, setBidAmount] = useState('');
  const [bidSubmitting, setBidSubmitting] = useState(false);
  const [bidError, setBidError] = useState(null);
  const [bidSuccess, setBidSuccess] = useState(null);

  // Active photo
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  const fetchListing = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listingApi.getListingById(id);
      setListing(data.listing);
      // Pre-fill suggested next bid amount
      if (data.listing) {
        const nextMin = !data.listing.leadingBid
          ? data.listing.startingPrice
          : data.listing.currentPrice + data.listing.minimumBidIncrement;
        setBidAmount(String(nextMin));
      }
    } catch (err) {
      setError(err.message || 'Failed to load listing details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  const handleBidSubmit = async (e) => {
    e.preventDefault();
    setBidError(null);
    setBidSuccess(null);

    const amountNum = parseInt(bidAmount, 10);
    if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
      setBidError('Please enter a valid positive integer amount.');
      return;
    }

    try {
      setBidSubmitting(true);
      const response = await bidApi.placeBid(id, amountNum);
      setBidSuccess(`Bid of ₹${amountNum} placed successfully!`);
      // Refresh listing data & bids from backend
      await fetchListing();
    } catch (err) {
      setBidError(err.message || 'Failed to place bid');
    } finally {
      setBidSubmitting(false);
    }
  };

  const handleCloseAuction = async () => {
    try {
      setBidSubmitting(true);
      await saleApi.closeAuction(id);
      setBidSuccess('Auction closed successfully.');
      await fetchListing();
    } catch (err) {
      setBidError(err.message || 'Failed to close auction');
    } finally {
      setBidSubmitting(false);
    }
  };

  if (loading) {
    return <Loading message="Loading auction details..." />;
  }

  if (error || !listing) {
    return (
      <div className="container">
        <ErrorMessage message={error || 'Listing not found'} onRetry={fetchListing} />
        <Link to="/" className="btn btn-secondary" style={{ marginTop: '1rem' }}>
          ← Back to Marketplace
        </Link>
      </div>
    );
  }

  const isSeller = Boolean(user && listing.seller && (listing.seller._id === user.id || listing.seller === user.id));
  const isExpired = new Date(listing.closingTime).getTime() <= new Date().getTime();
  const isBiddingOpen = listing.isBiddingActive && !isExpired;

  const minRequiredBid = !listing.leadingBid
    ? listing.startingPrice
    : listing.currentPrice + listing.minimumBidIncrement;

  const photosList = listing.photos && listing.photos.length > 0
    ? listing.photos
    : ['https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80'];

  return (
    <div className="container">
      <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem', fontWeight: 500 }}>
        ← Back to Marketplace
      </Link>

      <div className="details-grid">
        {/* Left Column: Photos & Description */}
        <div>
          <div className="gallery-main">
            <img
              src={photosList[selectedPhoto] || photosList[0]}
              alt={listing.title}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80';
              }}
            />
          </div>

          {photosList.length > 1 && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', overflowX: 'auto' }}>
              {photosList.map((photoUrl, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedPhoto(idx)}
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    border: selectedPhoto === idx ? '2px solid var(--primary)' : '1px solid var(--border)',
                    cursor: 'pointer',
                    padding: 0,
                    background: '#f1f5f9'
                  }}
                >
                  <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>Item Description</h2>
            <div style={{ whiteSpace: 'pre-line', color: 'var(--text-main)', lineHeight: 1.7, backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              {listing.description}
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>Public Bid History</h2>
            <BidHistory bids={listing.bids || []} />
          </div>
        </div>

        {/* Right Column: Pricing, Timer, and Bidding Box */}
        <div>
          <div className="bidding-box">
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <span className="badge badge-category">{listing.category}</span>
              <span className="badge badge-condition">Condition: {listing.condition}</span>
              <span className={`badge badge-status-${listing.status}`}>
                Status: {listing.status.replace(/_/g, ' ')}
              </span>
            </div>

            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
              {listing.title}
            </h1>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Listed by <strong>{listing.seller?.name || 'Fellow Student'}</strong>
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
              <div>
                <div className="price-label">
                  {listing.leadingBid ? 'Current Highest Bid' : 'Starting Price'}
                </div>
                <div style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--primary)' }}>
                  ₹{listing.currentPrice.toLocaleString('en-IN')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="price-label">Time Remaining</div>
                <CountdownTimer closingTime={listing.closingTime} onEnd={fetchListing} />
              </div>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div>• Starting Price: <strong>₹{listing.startingPrice.toLocaleString('en-IN')}</strong></div>
              <div>• Minimum Bid Increment: <strong>+₹{listing.minimumBidIncrement.toLocaleString('en-IN')}</strong></div>
              <div>• Minimum Required Bid: <strong style={{ color: 'var(--primary)' }}>₹{minRequiredBid.toLocaleString('en-IN')}</strong></div>
              <div>• Closes At: <strong>{new Date(listing.closingTime).toLocaleString('en-IN')}</strong></div>
            </div>

            {/* Notifications */}
            {bidError && <div className="alert alert-danger">{bidError}</div>}
            {bidSuccess && <div className="alert alert-success">{bidSuccess}</div>}

            {/* Bidding Controls */}
            {isSeller ? (
              <div className="alert alert-warning">
                <strong>Seller Notice:</strong> You are the owner of this auction. Sellers cannot bid on their own listings.
                {isExpired && listing.status === 'active' && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <button
                      onClick={handleCloseAuction}
                      disabled={bidSubmitting}
                      className="btn btn-primary btn-block"
                    >
                      {bidSubmitting ? 'Closing...' : 'Close Expired Auction Now'}
                    </button>
                  </div>
                )}
              </div>
            ) : !isBiddingOpen ? (
              <div className="alert alert-warning">
                <strong>Auction Inactive:</strong> Bidding is closed for this item (Status: {listing.status.replace(/_/g, ' ')}).
              </div>
            ) : !isAuthenticated ? (
              <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
                  You must be logged in as a student to place bids.
                </p>
                <Link to="/login" className="btn btn-primary btn-block">
                  Log In to Bid
                </Link>
              </div>
            ) : (
              <form onSubmit={handleBidSubmit}>
                <div className="form-group">
                  <label htmlFor="bidInput" className="form-label">
                    Your Bid Amount (₹ INR)
                  </label>
                  <input
                    id="bidInput"
                    type="number"
                    min={minRequiredBid}
                    step="1"
                    className="form-control"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder={`Min ₹${minRequiredBid}`}
                    required
                  />
                  <div className="form-help">
                    Must be at least ₹{minRequiredBid.toLocaleString('en-IN')}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={bidSubmitting || !bidAmount || parseInt(bidAmount, 10) < minRequiredBid}
                  className="btn btn-primary btn-block"
                  style={{ padding: '0.75rem' }}
                >
                  {bidSubmitting ? 'Submitting Bid...' : `Submit Bid of ₹${bidAmount || minRequiredBid}`}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ListingDetails;

