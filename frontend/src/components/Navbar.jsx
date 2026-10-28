import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
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
              <div className="user-badge">
                👤 {user?.name || 'Student'}
              </div>
              <button onClick={handleLogout} className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}>
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

