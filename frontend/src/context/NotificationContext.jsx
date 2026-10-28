import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { notificationApi } from '../api/notificationApi';
import {
  isNotificationSupported,
  getNotificationPermission,
  getNotificationPreference,
  setNotificationPreference,
  requestNotificationPermission,
  showBrowserPopUp
} from '../utils/browserNotifications';

const NotificationContext = createContext(null);

const POLL_INTERVAL_MS = 20000; // 20 seconds

export const NotificationProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Browser notification state
  const [browserPermission, setBrowserPermission] = useState(() => getNotificationPermission());
  const [browserEnabled, setBrowserEnabled] = useState(() => getNotificationPreference());
  const [permissionMessage, setPermissionMessage] = useState('');

  const inFlightRef = useRef(false);
  const lastCheckedRef = useRef(new Date());
  const isInitialLoadRef = useRef(true);

  // Sync permission state on mount
  useEffect(() => {
    setBrowserPermission(getNotificationPermission());
    setBrowserEnabled(getNotificationPreference());
  }, []);

  /**
   * Fetch full recent notifications list for the dropdown.
   */
  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const res = await notificationApi.getMyNotifications({ limit: 30 });
      if (res?.success) {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch (err) {
      console.warn('[NotificationContext] Failed to fetch notifications:', err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  /**
   * Lightweight poll for unread count and new notifications.
   */
  const pollUnread = useCallback(async () => {
    if (!isAuthenticated || inFlightRef.current) return;

    inFlightRef.current = true;
    const checkTime = new Date();

    try {
      // Pass since timestamp so backend returns only notifications created after that
      const sinceParam = isInitialLoadRef.current ? null : lastCheckedRef.current;
      const res = await notificationApi.getUnreadCount(sinceParam);

      if (res?.success) {
        setUnreadCount(res.unreadCount ?? 0);

        // If new notifications arrived and it's not the very first page load
        if (!isInitialLoadRef.current && res.newNotifications && res.newNotifications.length > 0) {
          // Prepend new notifications to the active list
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n._id));
            const fresh = res.newNotifications.filter((n) => !existingIds.has(n._id));
            return [...fresh, ...prev];
          });

          // Trigger browser pop-ups for each new notification
          res.newNotifications.forEach((n) => {
            showBrowserPopUp({
              title: n.title,
              message: n.message,
              listingId: n.listing,
              tag: n._id,
              onNavigate: (path) => navigate(path)
            });
          });
        }

        lastCheckedRef.current = checkTime;
        isInitialLoadRef.current = false;
      }
    } catch (err) {
      // Background poll failure is silent and non-blocking
      console.warn('[NotificationContext] Poll error:', err.message);
    } finally {
      inFlightRef.current = false;
    }
  }, [isAuthenticated, navigate]);

  // Start polling when authenticated, clean up on unmount or logout
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      setIsDropdownOpen(false);
      isInitialLoadRef.current = true;
      return;
    }

    // Initial check
    pollUnread();

    const timer = setInterval(() => {
      pollUnread();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isAuthenticated, pollUnread]);

  /**
   * Mark a single notification as read.
   */
  const markAsRead = async (id) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await notificationApi.markAsRead(id);
    } catch (err) {
      console.warn('[NotificationContext] Failed to mark as read:', err.message);
    }
  };

  /**
   * Mark all notifications as read.
   */
  const markAllAsRead = async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      await notificationApi.markAllAsRead();
    } catch (err) {
      console.warn('[NotificationContext] Failed to mark all as read:', err.message);
    }
  };

  /**
   * Request browser notification permission from user interaction.
   */
  const enableBrowserNotifications = async () => {
    const res = await requestNotificationPermission();
    setBrowserPermission(res.permission);
    setBrowserEnabled(res.enabled);
    setPermissionMessage(res.message);

    // If permission was granted, send a quick test welcome notification
    if (res.permission === 'granted') {
      showBrowserPopUp({
        title: 'Notifications Enabled!',
        message: 'You will now receive alerts for bids, outbids, and auction updates.',
        tag: 'welcome'
      });
    }

    return res;
  };

  /**
   * Toggle the notification preference (when permission is already granted).
   */
  const toggleBrowserNotifications = () => {
    const next = !browserEnabled;
    setBrowserEnabled(next);
    setNotificationPreference(next);
  };

  const toggleDropdown = () => {
    const nextState = !isDropdownOpen;
    setIsDropdownOpen(nextState);
    if (nextState) {
      fetchNotifications();
    }
  };

  const closeDropdown = () => {
    setIsDropdownOpen(false);
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        isDropdownOpen,
        toggleDropdown,
        closeDropdown,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        // Browser notification state & controls
        isSupported: isNotificationSupported(),
        browserPermission,
        browserEnabled,
        permissionMessage,
        enableBrowserNotifications,
        toggleBrowserNotifications
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;

