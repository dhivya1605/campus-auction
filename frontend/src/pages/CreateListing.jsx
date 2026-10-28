import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listingApi } from '../api/listingApi';

const CATEGORIES = ['cycle', 'calculator', 'books', 'electronics', 'other'];
const CONDITIONS = ['new', 'like-new', 'good', 'fair', 'poor'];

export const CreateListing = () => {
  const navigate = useNavigate();

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
    photoUrl: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e',
    additionalPhotos: '',
    startingPrice: '1000',
    minimumBidIncrement: '50',
    closingTime: formattedDefaultClosing
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validate photo URLs
    const photos = [formData.photoUrl.trim()];
    if (formData.additionalPhotos.trim()) {
      formData.additionalPhotos
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
        .forEach((url) => photos.push(url));
    }

    const payload = {
      title: formData.title.trim(),
      category: formData.category,
      condition: formData.condition,
      description: formData.description.trim(),
      photos,
      startingPrice: parseInt(formData.startingPrice, 10),
      minimumBidIncrement: parseInt(formData.minimumBidIncrement, 10),
      closingTime: new Date(formData.closingTime).toISOString()
    };

    if (new Date(payload.closingTime) <= new Date()) {
      setError('Closing time must be in the future.');
      return;
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
              placeholder="Describe age, functionality, accessories included, and condition..."
              className="form-control"
              value={formData.description}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="photoUrl">
              Primary Photo URL *
            </label>
            <input
              id="photoUrl"
              type="url"
              name="photoUrl"
              required
              placeholder="https://images.unsplash.com/photo-..."
              className="form-control"
              value={formData.photoUrl}
              onChange={handleChange}
            />
            <div className="form-help">Enter a public image URL or paste an Unsplash photo link.</div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="additionalPhotos">
              Additional Photo URLs (Optional, one per line)
            </label>
            <textarea
              id="additionalPhotos"
              name="additionalPhotos"
              placeholder="https://...&#10;https://..."
              className="form-control"
              style={{ minHeight: '60px' }}
              value={formData.additionalPhotos}
              onChange={handleChange}
            />
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

