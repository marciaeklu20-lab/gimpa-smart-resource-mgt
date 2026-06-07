"use client";

// Stage 4o Phase 1 (redesign) — left-hand filter sidebar for the map.
//
// Pure controlled component: owns no state beyond the Autocomplete ref,
// drives the `filters` object held by LiveMapView. Category + condition
// filters apply client-side against the live resources snapshot.
//
// The free-text "search resources by name/code" box is replaced by a
// Google Places Autocomplete: selecting a place bubbles its coordinates
// up via onPlaceSelected, and LiveMapView pans the map there. It is a
// geographic locator, not a resource filter.

import { useRef } from "react";

import { Autocomplete } from "@react-google-maps/api";

import { CONDITIONS } from "@/app/lib/resourceMeta";

const EMPTY_FILTERS = { search: "", categories: [], condition: "all" };

// Bias suggestions toward GIMPA Greenhill (Achimota) + ~2km around it.
// Built lazily (only when google is loaded) so we never touch the global
// before the Maps script is ready.
function gimpaBounds() {
  if (typeof window === "undefined" || !window.google) return undefined;
  return new window.google.maps.LatLngBounds(
    new window.google.maps.LatLng(5.640, -0.205),
    new window.google.maps.LatLng(5.660, -0.180)
  );
}

export default function MapFilters({
  categories,
  filters,
  setFilters,
  shown,
  total,
  mapsReady = false,
  onPlaceSelected
}) {

  const autocompleteRef = useRef(null);

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

  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    const loc = place?.geometry?.location;
    if (loc && onPlaceSelected) {
      onPlaceSelected({
        lat: loc.lat(),
        lng: loc.lng(),
        name: place.name || place.formatted_address || ""
      });
    }
  };

  return (
    <aside className="live-map-filters">

      <h3 className="live-map-filters-title">Filters</h3>

      <div className="live-map-filter-group">
        <label className="live-map-filter-label" htmlFor="live-map-search">
          Find a location
        </label>
        {mapsReady ? (
          <Autocomplete
            onLoad={(ac) => { autocompleteRef.current = ac; }}
            onPlaceChanged={handlePlaceChanged}
            options={{
              bounds: gimpaBounds(),
              strictBounds: false,
              types: ["establishment", "geocode"]
            }}
          >
            <input
              type="text"
              className="map-place-search"
              placeholder="Search GIMPA buildings, locations…"
            />
          </Autocomplete>
        ) : (
          <input
            type="text"
            className="map-place-search"
            placeholder="Loading place search…"
            disabled
          />
        )}
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
