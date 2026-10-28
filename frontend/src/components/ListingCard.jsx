import React from 'react';
import { Link } from 'react-router-dom';
import { getImageUrl, PLACEHOLDER_IMAGE } from '../utils/imageUrl';
import CountdownTimer from './CountdownTimer';

export const ListingCard = ({ listing }) => {
  const {
    _id,
    title,
    category,
    condition,
    photos,
    currentPrice,
    startingPrice,
    leadingBid,
    closingTime,
    status,
    seller
  } = listing;

  const defaultPhoto = PLACEHOLDER_IMAGE;
  const displayPhoto = getImageUrl(photos?.[0]);

  const isLeading = Boolean(leadingBid);

  return (
    <div className="listing-card">
      <Link to={`/listings/${_id}`} className="card-img-wrapper">
        <img
          src={displayPhoto}
          alt={title}
          className="card-img"
          onError={(e) => {
            e.target.onerror = null;
            e.target.src = PLACEHOLDER_IMAGE;
          }}
        />
        <div className="card-badges">
          <span className="badge badge-category">{category}</span>
          <span className="badge badge-condition">{condition}</span>
        </div>
      </Link>

      <div className="card-body">
        <Link to={`/listings/${_id}`}>
          <h3 className="card-title">{title}</h3>
        </Link>

        <div style={{ marginBottom: '0.75rem' }}>
          <span className={`badge badge-status-${status}`}>{status.replace(/_/g, ' ')}</span>
        </div>

        <div className="card-price-row">
          <div>
            <div className="price-label">{isLeading ? 'Current Bid' : 'Starting Price'}</div>
            <div className="price-value">₹{currentPrice.toLocaleString('en-IN')}</div>
          </div>
          <CountdownTimer closingTime={closingTime} />
        </div>
      </div>

      <div className="card-footer">
        <span>Seller: {seller?.name || 'Student'}</span>
        <Link to={`/listings/${_id}`} className="btn btn-secondary" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>
          View & Bid
        </Link>
      </div>
    </div>
  );
};

export default ListingCard;

