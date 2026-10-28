import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingApi } from '../api/listingApi';

const CATEGORIES = ['cycle', 'calculator', 'books', 'electronics', 'other'];
const CONDITIONS = ['new', 'like-new', 'good', 'fair', 'poor'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB per image
const MAX_IMAGES = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const CreateListing = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Default closing time: 48 hours from now in local ISO format for input
  const defaultClosingDate = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const formattedDefaultClosing = new Date(
    defaultClosingDate.getTime() - defaultClosingDate.getTimezoneOffset() * 60000
  )
    .toISOString()
    .slice(0, 16);

  const [formData, setFormData] = useState({
    title: '',
    category: 'cycle',
    condition: 'good',
    description: '',
    startingPrice: '1000',
    minimumBidIncrement: '50',
    closingTime: formattedDefaultClosing
  });

  // Array of { id, file, previewUrl }
  const [selectedImages, setSelectedImages] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Cleanup blob URLs when component unmounts
  useEffect(() => {
    return () => {
      selectedImages.forEach((img) => {
        if (img.previewUrl && img.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(img.previewUrl);
        }
      });
    };
  }, [selectedImages]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFilesSelect = (e) => {
    setError(null);
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const availableSlots = MAX_IMAGES - selectedImages.length;
    if (availableSlots <= 0) {
      setError(`Maximum limit of ${MAX_IMAGES} images already reached.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (files.length > availableSlots) {
      setError(`You can only add ${availableSlots} more image${availableSlots > 1 ? 's' : ''}. Maximum is ${MAX_IMAGES}.`);
    }

    const filesToAdd = files.slice(0, availableSlots);
    const newItems = [];

    for (const file of filesToAdd) {
      if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
        setError(`File "${file.name}" has an invalid type. Only JPEG, PNG, and WebP are allowed.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setError(`File "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed is 5 MB.`);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      newItems.push({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file)
      });
    }

    setSelectedImages((prev) => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (idToRemove) => {
    setSelectedImages((prev) => {
      const itemToRemove = prev.find((item) => item.id === idToRemove);
      if (itemToRemove?.previewUrl && itemToRemove.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(itemToRemove.previewUrl);
      }
      return prev.filter((item) => item.id !== idToRemove);
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const closingDate = new Date(formData.closingTime);
    if (closingDate <= new Date()) {
      setError('Closing time must be in the future.');
      return;
    }

    // Prepare multipart form data
    const payload = new FormData();
    payload.append('title', formData.title.trim());
    payload.append('category', formData.category);
    payload.append('condition', formData.condition);
    payload.append('description', formData.description.trim());
    payload.append('startingPrice', String(parseInt(formData.startingPrice, 10)));
    payload.append('minimumBidIncrement', String(parseInt(formData.minimumBidIncrement, 10)));
    payload.append('closingTime', closingDate.toISOString());

    // Append up to 5 images
    selectedImages.forEach((img) => {
      payload.append('images', img.file);
    });

    try {
      setSubmitting(true);
      const res = await listingApi.createListing(payload);
      if (res.listing?._id) {
        navigate(`/listings/${res.listing._id}`);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Failed to create listing');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '720px' }}>
      <div className="page-header">
        <h1 className="page-title">Create Auction Listing</h1>
        <p className="page-subtitle">
          List an item for second-hand auction to campus students. Upload up to 5 photos.
        </p>
      </div>

      <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '2rem' }}>
        {error && <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="title">
              Item Title *
            </label>
            <input
              id="title"
              type="text"
              name="title"
              required
              minLength={3}
              maxLength={120}
              placeholder="e.g. Hero Sprint 21 Speed Cycle, Casio fx-991EX..."
              className="form-control"
              value={formData.title}
              onChange={handleChange}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="category">
                Category *
              </label>
              <select
                id="category"
                name="category"
                className="form-control"
                value={formData.category}
                onChange={handleChange}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="condition">
                Condition *
              </label>
              <select
                id="condition"
                name="condition"
                className="form-control"
                value={formData.condition}
                onChange={handleChange}
              >
                {CONDITIONS.map((cond) => (
                  <option key={cond} value={cond}>
                    {cond.charAt(0).toUpperCase() + cond.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="description">
              Detailed Description *
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={4}
              minLength={10}
              maxLength={3000}
              placeholder="Describe item condition, age, usage, and any accessories included..."
              className="form-control"
              value={formData.description}
              onChange={handleChange}
            />
          </div>

          {/* Multiple Image Upload Control */}
          <div className="form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>
                Product Photos (Up to 5)
              </label>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {selectedImages.length} of {MAX_IMAGES} selected
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              id="imageUpload"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFilesSelect}
              style={{ display: 'none' }}
              disabled={selectedImages.length >= MAX_IMAGES}
            />

            {/* Selected Images Grid */}
            {selectedImages.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: '1rem'
                }}
              >
                {selectedImages.map((img, index) => (
                  <div
                    key={img.id}
                    style={{
                      position: 'relative',
                      height: '110px',
                      borderRadius: 'var(--radius-sm)',
                      overflow: 'hidden',
                      border: index === 0 ? '2px solid var(--primary)' : '1px solid var(--border)',
                      backgroundColor: '#f1f5f9'
                    }}
                  >
                    <img
                      src={img.previewUrl}
                      alt={`Preview ${index + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    {index === 0 && (
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
                        Main Photo
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(img.id)}
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: 'rgba(0,0,0,0.65)',
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
                      title="Remove image"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedImages.length < MAX_IMAGES && (
              <div
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1.5rem 1rem',
                  textAlign: 'center',
                  backgroundColor: '#fafafa',
                  cursor: 'pointer'
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>📷</div>
                <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                  {selectedImages.length === 0 ? 'Choose product photos from your device' : 'Add more photos'}
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Supports JPEG, PNG, or WebP (max 5 MB each, up to {MAX_IMAGES - selectedImages.length} more)
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  📁 Select Images
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="startingPrice">
                Starting Price (₹ INR) *
              </label>
              <input
                id="startingPrice"
                type="number"
                name="startingPrice"
                required
                min="0"
                step="1"
                placeholder="1000"
                className="form-control"
                value={formData.startingPrice}
                onChange={handleChange}
              />
              <span className="form-help">Minimum price to open bidding.</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="minimumBidIncrement">
                Minimum Bid Increment (₹ INR) *
              </label>
              <input
                id="minimumBidIncrement"
                type="number"
                name="minimumBidIncrement"
                required
                min="1"
                step="1"
                placeholder="50"
                className="form-control"
                value={formData.minimumBidIncrement}
                onChange={handleChange}
              />
              <span className="form-help">Each next bid must increase by at least this.</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="closingTime">
              Auction Closing Date & Time *
            </label>
            <input
              id="closingTime"
              type="datetime-local"
              name="closingTime"
              required
              className="form-control"
              value={formData.closingTime}
              onChange={handleChange}
            />
            <span className="form-help">Bidding will automatically stop after this time.</span>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{ flex: 1, padding: '0.85rem' }}
            >
              {submitting ? 'Creating Listing...' : 'Publish Auction Listing'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/')}
              style={{ padding: '0.85rem 1.5rem' }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateListing;
