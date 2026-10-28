import React, { useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return '';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 45) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

const getEventIcon = (eventType) => {
  switch (eventType) {
    case 'BID_PLACED':
      return '🏷️';
    case 'NEW_BID_ON_LISTING':
      return '💰';
    case 'OUTBID':
      return '⚠️';
    case 'AUCTION_CLOSED_WINNER':
      return '🏆';
    case 'AUCTION_CLOSED_NO_WINNER':
      return '⏳';
    case 'BID_APPROVED':
      return '✅';
    case 'BID_REJECTED':
      return '❌';
    case 'HANDOVER_CONFIRMED_BY_SELLER':
      return '📍';
    case 'HANDOVER_CONFIRMED_BY_BUYER':
      return '🛍️';
    case 'HANDOVER_COMPLETED':
      return '🎉';
    case 'FAILED_PICKUP':
      return '⚠️';
    case 'SALE_CANCELLED':
    case 'LISTING_CANCELLED':
      return '🚫';
    case 'QUESTION_ASKED':
    case 'QUESTION_ANSWERED':
      return '💬';
    default:
      return '🔔';
  }
};

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const {
    notifications,
    unreadCount,
    loading,
    isDropdownOpen,
    toggleDropdown,
    closeDropdown,
    markAsRead,
    markAllAsRead,
    isSupported,
    browserPermission,
    browserEnabled,
    enableBrowserNotifications,
    toggleBrowserNotifications
  } = useNotifications();

  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        closeDropdown();
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isDropdownOpen, closeDropdown]);

  const handleLogout = () => {
    closeDropdown();
    logout();
    navigate('/login');
  };

  const handleNotificationClick = (notification) => {
    if (!notification.isRead) {
      markAsRead(notification._id);
    }
    closeDropdown();

    // Route appropriately based on event type and linked listing
    if (
      notification.eventType === 'BID_APPROVED' ||
      notification.eventType === 'HANDOVER_CONFIRMED_BY_SELLER' ||
      notification.eventType === 'AUCTION_CLOSED_WINNER'
    ) {
      navigate('/my-purchases');
    } else if (notification.listing) {
      navigate(`/listings/${notification.listing}`);
    }
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          🎓 <span>Campus</span>Auction
        </Link>

        <nav>
          <ul className="navbar-nav">
            <li>
              <NavLink to="/" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end>
                Marketplace
              </NavLink>
            </li>
            {isAuthenticated && (
              <>
                <li>
                  <NavLink to="/create-listing" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    + Sell Item
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/my-listings" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    My Listings & Sales
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/my-purchases" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    My Purchases
                  </NavLink>
                </li>
              </>
            )}
          </ul>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isAuthenticated ? (
            <>
              {/* Notification Bell & Dropdown */}
              <div className="notification-bell-container" ref={dropdownRef}>
                <button
                  type="button"
                  className="notification-bell-btn"
                  onClick={toggleDropdown}
                  aria-label="View notifications"
                  title="Notifications"
                >
                  🔔
                  {unreadCount > 0 && (
                    <span className="notification-badge">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {isDropdownOpen && (
                  <div className="notification-dropdown">
                    {/* Dropdown Header */}
                    <div className="notification-dropdown-header">
                      <div className="notification-dropdown-title">
                        Notifications
                        {unreadCount > 0 && (
                          <span className="notification-count-pill">{unreadCount} new</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            className="notification-mark-all-btn"
                            onClick={markAllAsRead}
                          >
                            Mark all read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={closeDropdown}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            fontSize: '1rem',
                            padding: '0 0.25rem'
                          }}
                          aria-label="Close"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Browser Notifications Control Banner */}
                    <div className="notification-banner">
                      {!isSupported ? (
                        <span className="notification-banner-text">
                          Browser alerts not supported by this browser.
                        </span>
                      ) : browserPermission === 'default' ? (
                        <>
                          <span className="notification-banner-text">
                            Enable browser pop-ups for live outbid and auction alerts.
                          </span>
                          <button
                            type="button"
                            className="notification-banner-btn"
                            onClick={enableBrowserNotifications}
                          >
                            Turn On
                          </button>
                        </>
                      ) : browserPermission === 'denied' ? (
                        <span className="notification-banner-text" style={{ color: '#b91c1c' }}>
                          ⚠️ Pop-up alerts blocked in your browser settings.
                        </span>
                      ) : (
                        <>
                          <span className="notification-banner-text">
                            Browser pop-ups:{' '}
                            <strong style={{ color: browserEnabled ? '#16a34a' : 'var(--text-muted)' }}>
                              {browserEnabled ? 'Active' : 'Muted'}
                            </strong>
                          </span>
                          <button
                            type="button"
                            className="notification-banner-btn notification-banner-btn-secondary"
                            onClick={toggleBrowserNotifications}
                          >
                            {browserEnabled ? 'Mute' : 'Unmute'}
                          </button>
                        </>
                      )}
                    </div>

                    {/* Notification Items List */}
                    <ul className="notification-list">
                      {loading && notifications.length === 0 ? (
                        <li style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                          <div className="spinner" style={{ width: '24px', height: '24px', margin: '0 auto 0.5rem' }} />
                          <span style={{ fontSize: '0.85rem' }}>Loading alerts...</span>
                        </li>
                      ) : notifications.length === 0 ? (
                        <li className="notification-empty">
                          <div className="notification-empty-icon">📭</div>
                          <div className="notification-empty-text">No notifications yet</div>
                          <div className="notification-empty-subtext">
                            You will see alerts here when you bid, get outbid, or sell items.
                          </div>
                        </li>
                      ) : (
                        notifications.map((n) => (
                          <li
                            key={n._id}
                            className={`notification-item ${!n.isRead ? 'unread' : ''}`}
                            onClick={() => handleNotificationClick(n)}
                          >
                            <div className="notification-icon-wrapper">
                              {getEventIcon(n.eventType)}
                            </div>
                            <div className="notification-content">
                              <div className="notification-item-title">
                                <span>{n.title}</span>
                                {!n.isRead && <span className="notification-unread-dot" />}
                              </div>
                              <div className="notification-item-message">{n.message}</div>
                              <div className="notification-item-time">{formatTimeAgo(n.createdAt)}</div>
                            </div>
                            {!n.isRead && (
                              <div className="notification-item-actions">
                                <button
                                  type="button"
                                  className="notification-item-read-btn"
                                  title="Mark as read"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    markAsRead(n._id);
                                  }}
                                >
                                  ✓
                                </button>
                              </div>
                            )}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}
              </div>

              <div className="user-badge">
                👤 {user?.name || 'Student'}
              </div>
              <button
                onClick={handleLogout}
                className="btn btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}>
                Login
              </Link>
              <Link to="/register" className="btn btn-primary" style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}>
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
