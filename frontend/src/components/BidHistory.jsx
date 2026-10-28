import React from 'react';

export const BidHistory = ({ bids = [] }) => {
  if (!bids || bids.length === 0) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-sm)' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          No bids placed yet. Be the first to place an opening bid!
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="bids-table">
        <thead>
          <tr>
            <th>Bidder</th>
            <th>Amount</th>
            <th>Placed At</th>
          </tr>
        </thead>
        <tbody>
          {bids.map((bid, index) => {
            const isHighest = index === 0;
            const formattedDate = new Date(bid.createdAt).toLocaleString('en-IN', {
              dateStyle: 'short',
              timeStyle: 'short'
            });

            return (
              <tr key={bid.id || bid._id || index} style={isHighest ? { backgroundColor: '#f0fdf4' } : {}}>
                <td style={{ fontWeight: isHighest ? 600 : 400 }}>
                  {bid.bidder?.name || 'Student'}
                  {isHighest && (
                    <span
                      style={{
                        marginLeft: '0.5rem',
                        fontSize: '0.7rem',
                        backgroundColor: '#dcfce7',
                        color: '#15803d',
                        padding: '0.15rem 0.4rem',
                        borderRadius: '4px',
                        fontWeight: 600
                      }}
                    >
                      Highest
                    </span>
                  )}
                </td>
                <td style={{ fontWeight: 600, color: 'var(--primary)' }}>
                  ₹{Number(bid.amount).toLocaleString('en-IN')}
                </td>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {formattedDate}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default BidHistory;

