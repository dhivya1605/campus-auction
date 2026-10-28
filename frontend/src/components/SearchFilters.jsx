import React from 'react';

const CATEGORIES = ['cycle', 'calculator', 'books', 'electronics', 'other'];
const CONDITIONS = ['new', 'like-new', 'good', 'fair', 'poor'];

export const SearchFilters = ({ filters, onChange, onReset }) => {
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    onChange({
      ...filters,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  return (
    <div className="filters-card">
      <div className="filters-row">
        {/* Keyword Search */}
        <input
          type="text"
          name="search"
          placeholder="Search items (e.g. cycle, calculator, book)..."
          value={filters.search || ''}
          onChange={handleInputChange}
          className="form-control"
          style={{ flex: '2 1 240px' }}
        />

        {/* Category Filter */}
        <select
          name="category"
          value={filters.category || ''}
          onChange={handleInputChange}
          className="form-control"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>

        {/* Condition Filter */}
        <select
          name="condition"
          value={filters.condition || ''}
          onChange={handleInputChange}
          className="form-control"
        >
          <option value="">All Conditions</option>
          {CONDITIONS.map((cond) => (
            <option key={cond} value={cond}>
              {cond.charAt(0).toUpperCase() + cond.slice(1)}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          name="sort"
          value={filters.sort || 'newest'}
          onChange={handleInputChange}
          className="form-control"
        >
          <option value="newest">Newest First</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="price_desc">Price: High to Low</option>
          <option value="closing_soon">Closing Soonest</option>
        </select>

        {/* Closing Soon Checkbox */}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            name="closingSoon"
            checked={Boolean(filters.closingSoon)}
            onChange={handleInputChange}
          />
          Closing within 24h
        </label>

        {/* Reset Button */}
        <button
          type="button"
          onClick={onReset}
          className="btn btn-secondary"
          style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default SearchFilters;

