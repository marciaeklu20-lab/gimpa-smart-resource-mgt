"use client";

// Stage 4o Phase 1 — left-hand filter sidebar for the Live Map.
//
// Pure controlled component: owns no state, drives the `filters` object
// held by LiveMapView. Filters are applied client-side against the live
// resources snapshot.

import { CONDITIONS } from "@/app/lib/resourceMeta";

const EMPTY_FILTERS = { search: "", categories: [], condition: "all" };

export default function MapFilters({ categories, filters, setFilters, shown, total }) {

  const toggleCategory = (cat) => {
    setFilters((f) => {
      const has = f.categories.includes(cat);
      return {
        ...f,
        categories: has
          ? f.categories.filter((c) => c !== cat)
          : [...f.categories, cat]
      };
    });
  };

  return (
    <aside className="live-map-filters">

      <h3 className="live-map-filters-title">Filters</h3>

      <div className="live-map-filter-group">
        <label className="live-map-filter-label" htmlFor="live-map-search">
          Search
        </label>
        <input
          id="live-map-search"
          type="text"
          className="live-map-search-input"
          placeholder="Asset code or name"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
        />
      </div>

      <div className="live-map-filter-group">
        <span className="live-map-filter-label">Category</span>
        {categories.length === 0 ? (
          <p className="live-map-filter-empty">No categories yet</p>
        ) : (
          categories.map((cat) => (
            <label key={cat} className="live-map-checkbox">
              <input
                type="checkbox"
                checked={filters.categories.includes(cat)}
                onChange={() => toggleCategory(cat)}
              />
              <span>{cat}</span>
            </label>
          ))
        )}
      </div>

      <div className="live-map-filter-group">
        <label className="live-map-filter-label" htmlFor="live-map-condition">
          Condition
        </label>
        <select
          id="live-map-condition"
          className="live-map-condition-select"
          value={filters.condition}
          onChange={(e) => setFilters((f) => ({ ...f, condition: e.target.value }))}
        >
          <option value="all">All</option>
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className="live-map-reset-btn"
        onClick={() => setFilters({ ...EMPTY_FILTERS })}
      >
        Reset filters
      </button>

      <p className="live-map-counter">
        Showing {shown} of {total} resources
      </p>

    </aside>
  );
}
