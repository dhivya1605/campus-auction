import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingApi } from '../api/listingApi';

const CATEGORIES = ['cycle', 'calculator', 'books', 'electronics', 'other'];
const CONDITIONS = ['new', 'like-new', 'good', 'fair', 'poor'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
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

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Cleanup blob URL when component unmounts or preview changes
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      setError('Invalid file format. Please select a JPEG, PNG, or WebP image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setError(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 5 MB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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

    if (selectedFile) {
      payload.append('image', selectedFile);
    }

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
          List an item for second-hand auction to campus students.
        </p>
      </div>

      <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '2rem' }}>
        {error && <div className="alert alert-danger">{error}</div>}

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
              minLength={10}
              maxLength={3000}
              placeholder="Describe item condition, age, usage, and any accessories included..."
              className="form-control"
              value={formData.description}
              onChange={handleChange}
            />
          </div>

          {/* Local Image Upload Control */}
          <div className="form-group">
            <label className="form-label">
              Product Image
            </label>

            <input
              ref={fileInputRef}
              type="file"
              id="imageUpload"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {!previewUrl ? (
              <div
                style={{
                  border: '2px dashed var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  backgroundColor: '#fafafa',
                  cursor: 'pointer'
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📷</div>
                <p style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                  Select product photo from your device
                </p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Supports JPEG, PNG, or WebP (up to 5 MB)
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  Choose Image
                </button>
              </div>
            ) : (
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  backgroundColor: '#fafafa'
                }}
              >
                <img
                  src={previewUrl}
                  alt="Preview"
                  style={{
                    width: '90px',
                    height: '90px',
                    objectFit: 'cover',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)'
                  }}
                />
                <div style={{ flexGrow: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                    {selectedFile?.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {(selectedFile?.size / 1024).toFixed(0)} KB • Ready to upload
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose Different Image
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                      onClick={handleRemoveImage}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="startingPrice">
                Starting Price (₹ INR) *
              </label>
              <input
                id="startingPrice"
                type="number"
                name="startingPrice"
                required
                min={0}
                step={1}
                className="form-control"
                value={formData.startingPrice}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="minimumBidIncrement">
                Min Bid Increment (₹ INR) *
              </label>
              <input
                id="minimumBidIncrement"
                type="number"
                name="minimumBidIncrement"
                required
                min={1}
                step={1}
                className="form-control"
                value={formData.minimumBidIncrement}
                onChange={handleChange}
              />
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
            <div className="form-help">
              Auction closes automatically after this deadline.
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary btn-block"
            style={{ padding: '0.875rem', marginTop: '1rem', fontSize: '1rem' }}
          >
            {submitting ? 'Creating Auction...' : 'Publish Auction Listing'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateListing;
