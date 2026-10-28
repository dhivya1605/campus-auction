/**
 * Browser Notifications API utilities.
 * Handles permission requests, user preferences, and displaying pop-up notifications.
 */

const PREF_KEY = 'campus_auction_notifications_enabled';

/**
 * Check if the browser supports the Notifications API.
 */
export const isNotificationSupported = () => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

/**
 * Get current browser permission state: 'granted' | 'denied' | 'default' | 'unsupported'.
 */
export const getNotificationPermission = () => {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
};

/**
 * Get the user's saved preference for notifications (enabled by default if permission is granted).
 */
export const getNotificationPreference = () => {
  const saved = localStorage.getItem(PREF_KEY);
  if (saved === null) {
    return true; // Enabled by default
  }
  return saved === 'true';
};

/**
 * Set the user's notification preference.
 */
export const setNotificationPreference = (enabled) => {
  localStorage.setItem(PREF_KEY, enabled ? 'true' : 'false');
};

/**
 * Request notification permission from the user.
 * Must be triggered by a direct user interaction (click).
 */
export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      enabled: false,
      message: 'Browser notifications are not supported on this browser.'
    };
  }

  // If already denied, do not repeatedly nag
  if (Notification.permission === 'denied') {
    return {
      supported: true,
      permission: 'denied',
      enabled: false,
      message: 'Notifications are blocked. Please enable them in your browser site settings.'
    };
  }

  try {
    const permission = await Notification.requestPermission();
    const enabled = permission === 'granted';
    setNotificationPreference(enabled);

    return {
      supported: true,
      permission,
      enabled,
      message:
        permission === 'granted'
          ? 'Browser notifications enabled!'
          : permission === 'denied'
          ? 'Notifications blocked by user.'
          : 'Permission dismissed.'
    };
  } catch (error) {
    console.error('[BrowserNotifications] Permission request error:', error);
    return {
      supported: true,
      permission: Notification.permission || 'default',
      enabled: false,
      message: 'Failed to request notification permission.'
    };
  }
};

/**
 * Display a real browser pop-up notification.
 * Safe against errors, checks permission & user preferences, and validates navigation targets.
 *
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string|null} [opts.listingId] - If provided, clicking focuses and navigates to the listing
 * @param {string} [opts.tag]            - De-duplication tag
 * @param {function} [opts.onNavigate]   - Callback for SPA navigation (e.g., navigate('/listings/...'))
 */
export const showBrowserPopUp = ({
  title,
  message,
  listingId = null,
  tag = undefined,
  onNavigate = null
}) => {
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== 'granted') return null;
  if (!getNotificationPreference()) return null;

  try {
    const fullTitle = `Campus Auction: ${title}`;
    const options = {
      body: message,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: tag || `notif_${Date.now()}`,
      renotify: false
    };

    const notification = new Notification(fullTitle, options);

    notification.onclick = () => {
      try {
        window.focus();
        notification.close();

        // Safely navigate to internal route without arbitrary external URL redirects
        if (listingId) {
          const safePath = `/listings/${listingId}`;
          if (typeof onNavigate === 'function') {
            onNavigate(safePath);
          } else {
            window.location.hash = '';
            window.location.pathname = safePath;
          }
        }
      } catch (err) {
        console.error('[BrowserNotifications] Click handler error:', err);
      }
    };

    return notification;
  } catch (err) {
    console.error('[BrowserNotifications] Failed to display notification:', err);
    return null;
  }
};

