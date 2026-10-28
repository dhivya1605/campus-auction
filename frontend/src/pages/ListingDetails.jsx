import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { listingApi } from '../api/listingApi';
import { bidApi } from '../api/bidApi';
import { saleApi } from '../api/saleApi';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import CountdownTimer from '../components/CountdownTimer';
import BidHistory from '../components/BidHistory';
import QuestionsAndAnswers from '../components/QuestionsAndAnswers';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import { getImageUrl, PLACEHOLDER_IMAGE } from '../utils/imageUrl';

export const ListingDetails = () => {
  const { id } = useParams();
  const { user, isAuthenticated } = useAuth();
  const { fetchNotifications } = useNotifications();

  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Guard against overlapping concurrent requests
  const inFlightRef = useRef(false);

  // Bidding form states
  const [bidAmount, setBidAmount] = useState('');
  const [bidSubmitting, setBidSubmitting] = useState(false);
  const [bidError, setBidError] = useState(null);
  const [bidSuccess, setBidSuccess] = useState(null);

  // Active photo
  const [selectedPhoto, setSelectedPhoto] = useState(0);

  const fetchListing = useCallback(async (isInitial = false) => {
    if (inFlightRef.current) return;

    try {
      inFlightRef.current = true;
      if (isInitial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
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
      setRefreshing(false);
      inFlightRef.current = false;
    }
  }, [id]);

  // Initial fetch when listing ID changes
  useEffect(() => {
    fetchListing(true);
  }, [fetchListing]);

  const handleAuctionEnd = useCallback(() => {
    // Smooth background update when the countdown reaches zero
    fetchListing(false);
  }, [fetchListing]);

  // Background live update for active auctions (every 20s, keeping existing view intact).
  // Must be here — before any early returns — to satisfy React's Rules of Hooks.
  useEffect(() => {
    // Guard inside the effect: only run the interval when we actually have a live auction.
    const isOpen = listing && listing.isBiddingActive && new Date(listing.closingTime).getTime() > Date.now();
    if (!isOpen) return;

    const interval = setInterval(() => {
      fetchListing(false);
    }, 20000);

    return () => clearInterval(interval);
  }, [listing, fetchListing]);

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
      const successMsg = response.extended
        ? `Bid of ₹${amountNum} placed! ⏱️ Anti-sniping protection triggered: closing time extended by 60 seconds!`
        : `Bid of ₹${amountNum} placed successfully!`;
      setBidSuccess(successMsg);
      // Smoothly update listing data and bids without resetting page loading state
      await fetchListing(false);
      fetchNotifications();
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
      await fetchListing(false);
      fetchNotifications();
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
        <ErrorMessage message={error || 'Listing not found'} onRetry={() => fetchListing(true)} />
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

  const rawPhotos = listing.photos && listing.photos.length > 0
    ? listing.photos
    : [PLACEHOLDER_IMAGE];
  const photosList = rawPhotos.map((p) => getImageUrl(p));

  const handlePrevPhoto = () => {
    setSelectedPhoto((prev) => (prev === 0 ? photosList.length - 1 : prev - 1));
  };

  const handleNextPhoto = () => {
    setSelectedPhoto((prev) => (prev === photosList.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="container">
      <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem', fontWeight: 500 }}>
        ← Back to Marketplace
      </Link>

      <div className="details-grid">
        {/* Left Column: Photos & Description */}
        <div>
          {/* Interactive Photo Gallery */}
          <div className="gallery-main" style={{ position: 'relative', overflow: 'hidden' }}>
            <img
              src={photosList[selectedPhoto] || photosList[0]}
              alt={listing.title}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = PLACEHOLDER_IMAGE;
              }}
            />

            {/* Gallery Counter */}
            {photosList.length > 1 && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '10px',
                  right: '10px',
                  backgroundColor: 'rgba(0, 0, 0, 0.65)',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontWeight: 600
                }}
              >
                {selectedPhoto + 1} of {photosList.length}
              </span>
            )}

            {/* Previous / Next Controls */}
            {photosList.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevPhoto}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '10px',
                    transform: 'translateY(-50%)',
                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    lineHeight: 1
                  }}
                  title="Previous photo"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={handleNextPhoto}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    right: '10px',
                    transform: 'translateY(-50%)',
                    backgroundColor: 'rgba(0, 0, 0, 0.55)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    lineHeight: 1
                  }}
                  title="Next photo"
                >
                  ›
                </button>
              </>
            )}
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
                    background: '#f1f5f9',
                    flexShrink: 0
                  }}
                >
                  <img
                    src={photoUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = PLACEHOLDER_IMAGE;
                    }}
                  />
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Public Bid History</h2>
              <button
                type="button"
                onClick={() => fetchListing(false)}
                disabled={refreshing}
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                title="Refresh latest bids"
              >
                <span>{refreshing ? 'Refreshing...' : '🔄 Refresh Bids'}</span>
              </button>
            </div>
            <BidHistory bids={listing.bids || []} />
          </div>

          {/* Listing Edit History / Audit Trail */}
          <div style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Listing Edit History
            </h2>
            {listing.editHistory && listing.editHistory.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {listing.editHistory.map((entry, idx) => (
                  <div
                    key={entry._id || idx}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '1rem',
                      fontSize: '0.85rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
                      <span>
                        ✏️ Edited by <strong>{entry.editedBy?.name || 'Seller / System'}</strong>
                      </span>
                      <span>{new Date(entry.editedAt).toLocaleString('en-IN')}</span>
                    </div>

                    {entry.reason && (
                      <div style={{ fontStyle: 'italic', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                        "{entry.reason}"
                      </div>
                    )}

                    <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {entry.changes &&
                        entry.changes.map((ch, cIdx) => (
                          <li key={cIdx}>
                            <strong>{ch.field}:</strong>{' '}
                            {ch.field === 'photos' ? (
                              <span>Updated photos ({Array.isArray(ch.newValue) ? ch.newValue.length : 0} image(s))</span>
                            ) : ch.field === 'closingTime' ? (
                              <span>Closing time set to {new Date(ch.newValue).toLocaleString('en-IN')}</span>
                            ) : (
                              <span>
                                Changed from "{String(ch.oldValue || '')}" to "{String(ch.newValue || '')}"
                              </span>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No edits made since initial publication. Original auction terms intact.
              </p>
            )}
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
                <CountdownTimer closingTime={listing.closingTime} onEnd={handleAuctionEnd} />
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

      {/* Questions and Answers Before Bidding */}
      <QuestionsAndAnswers
        listingId={id}
        isSeller={isSeller}
        isBiddingOpen={isBiddingOpen}
      />
    </div>
  );
};

export default ListingDetails;

