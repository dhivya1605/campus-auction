import React from 'react';

export const Loading = ({ message = 'Loading auctions...' }) => {
  return (
    <div className="state-container">
      <div className="spinner" />
      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{message}</p>
    </div>
  );
};

export default Loading;

