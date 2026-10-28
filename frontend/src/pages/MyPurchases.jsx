import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { saleApi } from '../api/saleApi';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { getImageUrl, PLACEHOLDER_IMAGE } from '../utils/imageUrl';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';

/**
 * MyPurchases page
 *
 * Shows all auctions where the logged-in user is the provisional winner.
 * The buyer can accept the purchase (confirm handover on their side) when:
 *  - The seller has approved the bid (outcome === 'reserved')
 *  - The seller has confirmed their side of the handover (confirmedBySeller === true)
 *  - The buyer has NOT yet confirmed (confirmedByBuyer === false)
 */

const OUTCOME_LABELS = {
  pending: 'Awaiting Seller Decision',
  reserved: 'Reserved – Awaiting Handover',
  completed: 'Completed ✓',
  rejected: 'Rejected by Seller',
  seller_cancelled: 'Cancelled by Seller',
  failed_pickup: 'Pickup Failed',
  unsold: 'Unsold'
};

const OUTCOME_BADGE_STYLE = {
  pending: { backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
  reserved: { backgroundColor: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' },
  completed: { backgroundColor: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
  rejected: { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
  seller_cancelled: { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
  failed_pickup: { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
  unsold: { backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }
};

const PurchaseCard = ({ purchase, onAccept, processingId }) => {
  const { listing, outcome, winningBid, seller, handoverConfirmation } = purchase;
  const listingId = typeof listing === 'object' ? listing._id : listing;
  const isProcessing = processingId === listingId;

  const sellerHasConfirmed = handoverConfirmation?.confirmedBySeller === true;
  const buyerHasConfirmed = handoverConfirmation?.confirmedByBuyer === true;
  const handoverLocation = handoverConfirmation?.handoverLocation || '';
  const handoverNotes = handoverConfirmation?.handoverNotes || '';

  // Buyer can accept when: outcome is 'reserved', seller confirmed, buyer hasn't yet
  const canAccept = outcome === 'reserved' && sellerHasConfirmed && !buyerHasConfirmed;

  const displayPhoto = listing?.photos?.[0] ? getImageUrl(listing.photos[0]) : PLACEHOLDER_IMAGE;
  const winAmount = winningBid?.amount ?? listing?.currentPrice;

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem',
        display: 'flex',
        gap: '1rem',
        flexWrap: 'wrap',
        alignItems: 'flex-start'
      }}
    >
      {/* Thumbnail */}
      <Link to={`/listings/${listingId}`} style={{ flexShrink: 0 }}>
        <img
          src={displayPhoto}
          alt={listing?.title || 'Product'}
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = PLACEHOLDER_IMAGE;
          }}
          style={{
            width: '90px',
            height: '90px',
            objectFit: 'cover',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)'
          }}
        />
      </Link>

      {/* Details */}
      <div style={{ flex: 1, minWidth: '200px' }}>
        <Link
          to={`/listings/${listingId}`}
          style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)', textDecoration: 'none' }}
        >
          {listing?.title || 'Listing'}
        </Link>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem', alignItems: 'center' }}>
          {listing?.category && (
            <span className="badge badge-category">{listing.category}</span>
          )}
          {listing?.condition && (
            <span className="badge badge-condition">{listing.condition}</span>
          )}
          <span
            style={{
              display: 'inline-block',
              padding: '0.15rem 0.5rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: '4px',
              ...OUTCOME_BADGE_STYLE[outcome]
            }}
          >
            {OUTCOME_LABELS[outcome] || outcome}
          </span>
        </div>

        <div
          style={{
            marginTop: '0.6rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem',
            fontSize: '0.875rem',
            color: 'var(--text-muted)'
          }}
        >
          <div>
            Winning Bid:{' '}
            <strong style={{ color: 'var(--primary)', fontSize: '1rem' }}>
              ₹{winAmount?.toLocaleString('en-IN') ?? '—'}
            </strong>
          </div>
          <div>
            Seller: <strong>{seller?.name || 'Unknown'}</strong>
          </div>
          {listing?.closingTime && (
            <div>Auction Closed: {new Date(listing.closingTime).toLocaleDateString('en-IN')}</div>
          )}
        </div>

        {/* Handover section */}
        {outcome === 'reserved' && (
          <div
            style={{
              marginTop: '0.85rem',
              padding: '0.75rem',
              backgroundColor: '#f8fafc',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              fontSize: '0.875rem'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
              📦 Handover Status
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: 'var(--text-muted)' }}>
              <div>
                Seller confirmed:{' '}
                <span style={{ color: sellerHasConfirmed ? '#065f46' : '#92400e', fontWeight: 600 }}>
                  {sellerHasConfirmed ? '✓ Yes' : '⏳ Pending'}
                </span>
              </div>
              <div>
                Your acceptance:{' '}
                <span style={{ color: buyerHasConfirmed ? '#065f46' : '#92400e', fontWeight: 600 }}>
                  {buyerHasConfirmed ? '✓ Accepted' : '⏳ Pending'}
                </span>
              </div>

              {handoverLocation && (
                <div style={{ marginTop: '0.25rem' }}>
                  📍 Handover Location: <strong>{handoverLocation}</strong>
                </div>
              )}
              {handoverNotes && (
                <div>
                  📝 Notes: <em>{handoverNotes}</em>
                </div>
              )}

              {!sellerHasConfirmed && (
                <div
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: '#fef3c7',
                    color: '#92400e',
                    borderRadius: '4px',
                    fontSize: '0.825rem'
                  }}
                >
                  ⚠️ Waiting for the seller to confirm the handover location first.
                </div>
              )}
            </div>
          </div>
        )}

        {outcome === 'completed' && (
          <div
            style={{
              marginTop: '0.85rem',
              padding: '0.6rem 0.75rem',
              backgroundColor: '#d1fae5',
              color: '#065f46',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: 600
            }}
          >
            🎉 Purchase complete! Both parties confirmed the campus handover.
            {handoverLocation && <div style={{ fontWeight: 400 }}>📍 Location: {handoverLocation}</div>}
          </div>
        )}
      </div>

      {/* Action Button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: '0.25rem' }}>
        {canAccept && (
          <button
            type="button"
            className="btn btn-success"
            style={{ padding: '0.5rem 1.1rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
            disabled={isProcessing}
            onClick={() => onAccept(listingId, handoverLocation)}
          >
            {isProcessing ? 'Accepting...' : '✓ Accept Purchase'}
          </button>
        )}

        {outcome === 'reserved' && buyerHasConfirmed && !sellerHasConfirmed && (
          <span
            style={{
              padding: '0.4rem 0.75rem',
              backgroundColor: '#dbeafe',
              color: '#1e40af',
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: 600
            }}
          >
            ✓ You Accepted – Waiting for Seller
          </span>
        )}

        {outcome === 'reserved' && buyerHasConfirmed && sellerHasConfirmed && (
          <span
            style={{
              padding: '0.4rem 0.75rem',
              backgroundColor: '#d1fae5',
              color: '#065f46',
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: 600
            }}
          >
            ✓ Handover Confirmed
          </span>
        )}
      </div>
    </div>
  );
};

export const MyPurchases = () => {
  const { user } = useAuth();
  const { fetchNotifications } = useNotifications();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [processingId, setProcessingId] = useState(null);
  const inFlightRef = useRef(false);

  const fetchPurchases = useCallback(async (isInitial = false) => {
    if (inFlightRef.current) return;
    try {
      inFlightRef.current = true;
      if (isInitial) setLoading(true);
      setError(null);
      const res = await saleApi.getMyPurchases();
      setPurchases(res.purchases || []);
    } catch (err) {
      setError(err.message || 'Failed to load your purchases');
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchPurchases(true);
  }, [fetchPurchases]);

  const handleAccept = async (listingId, knownLocation) => {
    const confirmed = window.confirm(
      'Accept this purchase?\n\nThis confirms that you agree to the campus handover. Once both the seller and you have confirmed, the transaction will be marked as completed.'
    );
    if (!confirmed) return;

    try {
      setProcessingId(listingId);
      setActionError(null);
      setActionSuccess(null);

      const res = await saleApi.acceptPurchase(listingId);
      setActionSuccess(
        res.isComplete
          ? '🎉 Handover completed! Both parties have confirmed. The transaction is now marked as completed.'
          : '✓ You have accepted the purchase. Waiting for seller confirmation to finalize.'
      );
      await fetchPurchases(false);
      fetchNotifications();
    } catch (err) {
      setActionError(err.message || 'Failed to accept purchase. Please try again.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">My Purchases</h1>
        <p className="page-subtitle">
          Auctions you have won. Accept the campus handover when the seller has arranged it.
        </p>
      </div>

      {actionSuccess && <div className="alert alert-success">{actionSuccess}</div>}
      {actionError && <div className="alert alert-danger">{actionError}</div>}
      {error && <ErrorMessage message={error} onRetry={() => fetchPurchases(true)} />}

      {loading ? (
        <Loading message="Loading your purchases..." />
      ) : purchases.length === 0 ? (
        <div className="state-container">
          <h2 className="empty-title">No Purchases Yet</h2>
          <p className="empty-text">
            You haven&apos;t won any auctions yet. Browse the marketplace and place a winning bid!
          </p>
          <Link to="/" className="btn btn-primary">
            Browse Marketplace
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          {/* Summary stats */}
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              flexWrap: 'wrap',
              fontSize: '0.875rem',
              color: 'var(--text-muted)'
            }}
          >
            <span>Total won: <strong>{purchases.length}</strong></span>
            <span>
              Awaiting handover:{' '}
              <strong>
                {purchases.filter((p) => p.outcome === 'reserved').length}
              </strong>
            </span>
            <span>
              Completed:{' '}
              <strong>
                {purchases.filter((p) => p.outcome === 'completed').length}
              </strong>
            </span>
          </div>

          {purchases.map((purchase) => {
            const listingId =
              typeof purchase.listing === 'object' ? purchase.listing._id : purchase.listing;
            return (
              <PurchaseCard
                key={purchase._id || listingId}
                purchase={purchase}
                onAccept={handleAccept}
                processingId={processingId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyPurchases;

