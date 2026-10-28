import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { listingApi } from '../api/listingApi';
import { useAuth } from '../context/AuthContext';
import { getImageUrl, PLACEHOLDER_IMAGE } from '../utils/imageUrl';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';

const CATEGORIES = ['cycle', 'calculator', 'books', 'electronics', 'other'];
const CONDITIONS = ['new', 'like-new', 'good', 'fair', 'poor'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGES = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const EditListing = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  const [hasBids, setHasBids] = useState(false);
  const [status, setStatus] = useState('');

  // Form fields
  const [formData, setFormData] = useState({
    title: '',
    category: 'cycle',
    condition: 'good',
    description: '',
    startingPrice: '1000',
    minimumBidIncrement: '50',
    closingTime: '',
    reason: ''
  });

  // Existing photos from server
  const [initialPhotos, setInitialPhotos] = useState([]);
  const [retainedPhotos, setRetainedPhotos] = useState([]);

  // Newly selected images { id, file, previewUrl }
  const [newImages, setNewImages] = useState([]);

  // Cleanup blob URLs on unmount or removal
  useEffect(() => {
    return () => {
      newImages.forEach((img) => {
        if (img.previewUrl && img.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(img.previewUrl);
        }
      });
    };
  }, [newImages]);

  useEffect(() => {
    const fetchListing = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const res = await listingApi.getListingById(id);
        const item = res.listing;

        if (!item) {
          setLoadError('Listing not found');
          return;
        }

        const sellerId = item.seller?._id || item.seller?.id || item.seller;
        if (user && sellerId && sellerId.toString() !== user.id.toString()) {
          setLoadError('You do not have permission to edit this listing.');
          return;
        }

        const nonEditable = ['completed', 'rejected', 'cancelled', 'failed_pickup', 'unsold'];
        if (nonEditable.includes(item.status)) {
          setLoadError(`Cannot edit this listing because its status is '${item.status}'.`);
          return;
        }

        const bidsExist = Boolean(item.leadingBid || (item.bids && item.bids.length > 0));
        setHasBids(bidsExist);
        setStatus(item.status);

        let formattedClosing = '';
        if (item.closingTime) {
          const cd = new Date(item.closingTime);
          formattedClosing = new Date(cd.getTime() - cd.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        }

        setFormData({
          title: item.title || '',
          category: item.category || 'cycle',
          condition: item.condition || 'good',
          description: item.description || '',
          startingPrice: String(item.startingPrice ?? 1000),
          minimumBidIncrement: String(item.minimumBidIncrement ?? 50),
          closingTime: formattedClosing,
          reason: ''
        });

        const photosList = Array.isArray(item.photos) ? item.photos : [];
        setInitialPhotos(photosList);
        setRetainedPhotos(photosList);
      } catch (err) {
        setLoadError(err.message || 'Failed to load listing for editing');
      } finally {
        setLoading(false);
      }
    };

    fetchListing();
  }, [id, user]);

  const totalImagesCount = retainedPhotos.length + newImages.length;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilesSelect = (e) => {
    setSubmitError(null);
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const availableSlots = MAX_IMAGES - totalImagesCount;
    if (availableSlots <= 0) {
      setSubmitError(`Maximum ${MAX_IMAGES} images reached.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (files.length > availableSlots) {
      setSubmitError(`You can only add ${availableSlots} more image${availableSlots > 1 ? 's' : ''}. Maximum allowed is ${MAX_IMAGES}.`);
    }

    const filesToAdd = files.slice(0, availableSlots);
    const newItems = [];

    for (const file of filesToAdd) {
      if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
        setSubmitError(`File "${file.name}" has an invalid type. Only JPEG, PNG, and WebP are allowed.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setSubmitError(`File "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      newItems.push({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file)
      });
    }

    setNewImages((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveRetainedPhoto = (photoPath) => {
    setRetainedPhotos((prev) => prev.filter((p) => p !== photoPath));
  };

  const handleRestoreInitialPhotos = () => {
    setRetainedPhotos(initialPhotos);
  };

  const handleRemoveNewImage = (idToRemove) => {
    setNewImages((prev) => {
      const item = prev.find((x) => x.id === idToRemove);
      if (item?.previewUrl && item.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return prev.filter((x) => x.id !== idToRemove);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    const payload = new FormData();
    payload.append('title', formData.title.trim());
    payload.append('category', formData.category);
    payload.append('condition', formData.condition);
    payload.append('description', formData.description.trim());
    if (formData.reason.trim()) {
      payload.append('reason', formData.reason.trim());
    }

    if (!hasBids) {
      const priceNum = parseInt(formData.startingPrice, 10);
      const incNum = parseInt(formData.minimumBidIncrement, 10);
      if (isNaN(priceNum) || priceNum < 0) {
        setSubmitError('Starting price must be a valid non-negative number.');
        return;
      }
      if (isNaN(incNum) || incNum < 1) {
        setSubmitError('Minimum bid increment must be at least 1 rupee.');
        return;
      }
      const closingDate = new Date(formData.closingTime);
      if (closingDate <= new Date()) {
        setSubmitError('Closing time must be set in the future.');
        return;
      }

      payload.append('startingPrice', priceNum);
      payload.append('minimumBidIncrement', incNum);
      payload.append('closingTime', new Date(formData.closingTime).toISOString());
    }

    // Retained photos list
    payload.append('retainedPhotos', JSON.stringify(retainedPhotos));

    // Append newly uploaded image files
    newImages.forEach((img) => {
      payload.append('images', img.file);
    });

    try {
      setSubmitting(true);
      await listingApi.updateListing(id, payload);
      setSubmitSuccess('Listing updated successfully!');
      setTimeout(() => {
        navigate('/my-listings');
      }, 1200);
    } catch (err) {
      setSubmitError(err.message || 'Failed to update listing.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <Loading message="Loading listing details..." />;
  }

  if (loadError) {
    return (
      <div className="container" style={{ maxWidth: '600px', margin: '2rem auto' }}>
        <ErrorMessage message={loadError} />
        <Link to="/my-listings" className="btn btn-secondary" style={{ marginTop: '1rem', display: 'inline-block' }}>
          ← Back to My Listings
        </Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: '720px', margin: '2rem auto' }}>
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link to="/my-listings" style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            ← Back to My Listings
          </Link>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, marginTop: '0.25rem' }}>Edit Listing</h1>
        </div>
        <span className={`badge badge-status-${status}`}>
          Status: {status.replace(/_/g, ' ')}
        </span>
      </div>

      {hasBids && (
        <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
          <strong>Auction Fairness Notice:</strong> Valid bids have already been placed on this item. Starting price, minimum increment, and closing time are locked. You may still update description, category, condition, and photos. All changes are recorded in the listing's public audit history.
        </div>
      )}

      {submitError && <div className="alert alert-danger" style={{ marginBottom: '1.5rem' }}>{submitError}</div>}
      {submitSuccess && <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>{submitSuccess}</div>}

      <div style={{ backgroundColor: '#ffffff', borderRadius: 'var(--radius-md)', padding: '2rem', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="form-group">
            <label htmlFor="title" className="form-label">Item Title *</label>
            <input
              id="title"
              name="title"
              type="text"
              className="form-control"
              value={formData.title}
              onChange={handleChange}
              minLength={3}
              maxLength={120}
              required
            />
          </div>

          {/* Category & Condition */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="category" className="form-label">Category *</label>
              <select
                id="category"
                name="category"
                className="form-control"
                value={formData.category}
                onChange={handleChange}
                required
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="condition" className="form-label">Condition *</label>
              <select
                id="condition"
                name="condition"
                className="form-control"
                value={formData.condition}
                onChange={handleChange}
                required
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c.replace('-', ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="form-group">
            <label htmlFor="description" className="form-label">Description *</label>
            <textarea
              id="description"
              name="description"
              rows={4}
              className="form-control"
              value={formData.description}
              onChange={handleChange}
              minLength={10}
              maxLength={3000}
              required
            />
          </div>

          {/* Reason for Edit */}
          <div className="form-group">
            <label htmlFor="reason" className="form-label">Reason for Edit / Note for Bidders (Optional)</label>
            <input
              id="reason"
              name="reason"
              type="text"
              placeholder="e.g. Added more detailed photos, clarified condition note"
              className="form-control"
              value={formData.reason}
              onChange={handleChange}
              maxLength={200}
            />
            <span className="form-help">Recorded in the public audit trail.</span>
          </div>

          {/* Product Image Gallery Management (Up to 5 images) */}
          <div className="form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 0 }}>
                Manage Product Photos
              </label>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {totalImagesCount} of {MAX_IMAGES} photos
              </span>
            </div>
            <p className="form-help" style={{ marginBottom: '1rem' }}>
              Remove individual photos or upload new ones. First photo will be the main cover photo.
            </p>

            {/* Photos Preview Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1rem'
              }}
            >
              {/* Retained Server Photos */}
              {retainedPhotos.map((photoPath, idx) => (
                <div
                  key={`retained-${idx}`}
                  style={{
                    position: 'relative',
                    height: '110px',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    border: idx === 0 ? '2px solid var(--primary)' : '1px solid var(--border)',
                    backgroundColor: '#f1f5f9'
                  }}
                >
                  <img
                    src={getImageUrl(photoPath)}
                    alt={`Existing photo ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = PLACEHOLDER_IMAGE;
                    }}
                  />
                  {idx === 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '4px',
                        left: '4px',
                        background: 'var(--primary)',
                        color: '#fff',
                        fontSize: '0.65rem',
                        padding: '2px 5px',
                        borderRadius: '3px',
                        fontWeight: 600
                      }}
                    >
                      Cover
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveRetainedPhoto(photoPath)}
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      background: 'rgba(220, 38, 38, 0.85)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1
                    }}
                    title="Remove this photo"
                  >
                    ×
                  </button>
                </div>
              ))}

              {/* Newly Selected Uploads */}
              {newImages.map((img, idx) => (
                <div
                  key={img.id}
                  style={{
                    position: 'relative',
                    height: '110px',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    border: '2px dashed var(--primary)',
                    backgroundColor: '#f1f5f9'
                  }}
                >
                  <img
                    src={img.previewUrl}
                    alt={`New ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: '4px',
                      left: '4px',
                      background: 'var(--success, #16a34a)',
                      color: '#fff',
                      fontSize: '0.65rem',
                      padding: '2px 5px',
                      borderRadius: '3px',
                      fontWeight: 600
                    }}
                  >
                    New
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveNewImage(img.id)}
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      background: 'rgba(0,0,0,0.7)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1
                    }}
                    title="Remove this photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Photo Action Controls */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFilesSelect}
                style={{ display: 'none' }}
                disabled={totalImagesCount >= MAX_IMAGES}
              />

              {totalImagesCount < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                >
                  📷 Add Photo ({MAX_IMAGES - totalImagesCount} slot{MAX_IMAGES - totalImagesCount > 1 ? 's' : ''} left)
                </button>
              )}

              {retainedPhotos.length < initialPhotos.length && (
                <button
                  type="button"
                  onClick={handleRestoreInitialPhotos}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                >
                  ↺ Restore Original Photos
                </button>
              )}
            </div>
          </div>

          {/* Pricing & Timing */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
            <div className="form-group">
              <label htmlFor="startingPrice" className="form-label">
                Starting Price (₹ INR) {hasBids && '🔒'}
              </label>
              <input
                id="startingPrice"
                name="startingPrice"
                type="number"
                min="0"
                step="1"
                className="form-control"
                value={formData.startingPrice}
                onChange={handleChange}
                disabled={hasBids}
                required
              />
              {hasBids && <span className="form-help">Locked after first valid bid.</span>}
            </div>

            <div className="form-group">
              <label htmlFor="minimumBidIncrement" className="form-label">
                Min Bid Increment (₹ INR) {hasBids && '🔒'}
              </label>
              <input
                id="minimumBidIncrement"
                name="minimumBidIncrement"
                type="number"
                min="1"
                step="1"
                className="form-control"
                value={formData.minimumBidIncrement}
                onChange={handleChange}
                disabled={hasBids}
                required
              />
              {hasBids && <span className="form-help">Locked after first valid bid.</span>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="closingTime" className="form-label">
              Auction Closing Date & Time {hasBids && '🔒'}
            </label>
            <input
              id="closingTime"
              name="closingTime"
              type="datetime-local"
              className="form-control"
              value={formData.closingTime}
              onChange={handleChange}
              disabled={hasBids}
              required
            />
            {hasBids && <span className="form-help">Locked after first valid bid.</span>}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{ flex: 1, padding: '0.75rem' }}
            >
              {submitting ? 'Saving Changes...' : 'Save Changes'}
            </button>
            <Link
              to="/my-listings"
              className="btn btn-secondary"
              style={{ padding: '0.75rem 1.5rem' }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditListing;
