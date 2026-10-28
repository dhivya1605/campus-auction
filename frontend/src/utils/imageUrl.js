const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
export const BACKEND_BASE = API_URL.replace(/\/api\/?$/, '');

// Clean fallback placeholder SVG data URL
export const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23f1f5f9'/%3E%3Cpath d='M170 130a20 20 0 1 0 0-40 20 20 0 0 0 0 40zM120 210l40-50 30 35 45-60 65 75H120z' fill='%2394a3b8'/%3E%3Ctext x='50%25' y='245' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14' fill='%2364748b'%3ENo Image Available%3C/text%3E%3C/svg%3E";

/**
 * Resolves an image path from backend relative storage or full URL.
 */
export const getImageUrl = (photoPath) => {
  if (!photoPath) return PLACEHOLDER_IMAGE;

  if (
    photoPath.startsWith('http://') ||
    photoPath.startsWith('https://') ||
    photoPath.startsWith('data:')
  ) {
    return photoPath;
  }

  const cleanPath = photoPath.startsWith('/') ? photoPath : `/${photoPath}`;
  return `${BACKEND_BASE}${cleanPath}`;
};

export default getImageUrl;

