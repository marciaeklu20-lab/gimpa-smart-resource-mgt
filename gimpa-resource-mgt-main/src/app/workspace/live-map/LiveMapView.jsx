"use client";

// Stage 4o Phase 1 — Live Map of all resources at their home locations.
//
// Renders a Google Map (hybrid view, centred on GIMPA Greenhill) with one
// marker per resource, coloured by condition. A live Firestore
// subscription (subscribeResources) keeps markers in sync in real time —
// changing a resource's condition in the console recolours its pin
// without a refresh. Filters (search / category / condition) are applied
// client-side.
//
// Phase 1 shows HOME locations only. Real-time movement tracking (QR
// check-in, booking/transfer/maintenance transitions) ships in Phase 2
// and Phase 3.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { GoogleMap, InfoWindow, useJsApiLoader } from "@react-google-maps/api";

import {
  GIMPA_CENTER,
  DEFAULT_ZOOM,
  resourceMapPosition
} from "@/app/lib/gimpaBuildingCoordinates";
import { conditionLabel, formatLocation, relativeTime } from "@/app/lib/resourceMeta";

// Stage 4o Phase 2: human label for a currentLocation.source value.
const SOURCE_LABELS = {
  home: "home location",
  "qr-checkin": "QR check-in",
  manual: "manual update"
};

function sourceLabel(source) {
  return SOURCE_LABELS[source] || source || "home location";
}

import { subscribeResources } from "./subscribeResources";
import MapMarker from "./MapMarker";
import MapFilters from "./MapFilters";

import "@/app/styles/live-map/LiveMap.css";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Module-level so the array identity is stable across renders —
// useJsApiLoader warns ("LoadScript has been reloaded unintentionally")
// if libraries is a fresh array each render.
const MAPS_LIBRARIES = ["places"];

const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };
const MAP_OPTIONS = {
  mapTypeId: "hybrid", // satellite imagery + road/label overlay
  streetViewControl: false,
  fullscreenControl: true,
  mapTypeControl: true
};

const FOCUSED_ZOOM = 19; // closer than DEFAULT_ZOOM for the per-asset view

const DEFAULT_FILTERS = { search: "", categories: [], condition: "all" };

export default function LiveMapView({ currentUser, focusedAsset }) {

  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subError, setSubError] = useState(null);
  // Pre-open the InfoWindow on the focused asset (if any) on mount.
  const [selected, setSelected] = useState(focusedAsset || null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const mapRef = useRef(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "gimpa-live-map",
    googleMapsApiKey: API_KEY || "",
    libraries: MAPS_LIBRARIES
  });

  // Initial centre/zoom: tight on the focused asset's CURRENT location
  // when this is the per-asset route, otherwise the whole-campus default.
  const initialCenter = focusedAsset
    ? resourceMapPosition(focusedAsset)
    : GIMPA_CENTER;
  const initialZoom = focusedAsset ? FOCUSED_ZOOM : DEFAULT_ZOOM;

  // Live subscription — unsubscribes on unmount (no leak when the user
  // navigates away from the map route).
  useEffect(() => {
    const unsubscribe = subscribeResources(
      (list) => {
        setResources(list);
        setLoading(false);
      },
      (err) => {
        setSubError(err);
        setLoading(false);
      }
    );
    return () => unsubscribe && unsubscribe();
  }, []);

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  const onMapUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  // Places Autocomplete (in MapFilters) bubbles a selected location up
  // here; pan + zoom the map to it. Pure camera move — does not touch
  // the resource markers or the focused asset.
  const handlePlaceSelected = useCallback(({ lat, lng }) => {
    if (mapRef.current && Number.isFinite(lat) && Number.isFinite(lng)) {
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(18);
    }
  }, []);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(resources.map((r) => r.category).filter(Boolean))
      ).sort(),
    [resources]
  );

  const filteredResources = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return resources.filter((r) => {
      if (filters.condition !== "all" && r.condition !== filters.condition) {
        return false;
      }
      if (
        filters.categories.length > 0 &&
        !filters.categories.includes(r.category)
      ) {
        return false;
      }
      if (q) {
        const code = (r.assetCode || r.id || "").toLowerCase();
        const name = (r.resourceName || "").toLowerCase();
        if (!code.includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [resources, filters]);

  // Keep the open InfoWindow in sync with live data (e.g. a condition
  // change). Resolve against the FULL resource list — not the filtered
  // one — so the pre-opened focused-asset InfoWindow stays put even when
  // the filters would hide it. Falls back to the selected object so the
  // window shows immediately on mount, before the first snapshot lands.
  const selectedLive = useMemo(() => {
    if (!selected) return null;
    return resources.find((r) => r.id === selected.id) || selected;
  }, [selected, resources]);

  // Position + live-location metadata for the open InfoWindow. Shares the
  // same helper the markers use, so the popup anchors exactly on its pin.
  const selectedPos = useMemo(
    () => (selectedLive ? resourceMapPosition(selectedLive) : null),
    [selectedLive]
  );

  // --- Missing API key: clear error state, never a crash -------------
  if (!API_KEY) {
    return (
      <div className="live-map-error">
        <h3>Map unavailable</h3>
        <p>
          The <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> environment
          variable is not set. Add it to <code>.env.local</code> and
          restart the dev server to enable the Live Map.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="live-map-error">
        <h3>Map failed to load</h3>
        <p>
          Google Maps could not be initialised. Check that the API key is
          valid and that the Maps JavaScript API is enabled for the project.
        </p>
      </div>
    );
  }

  return (
    <div className="live-map-container">

      <MapFilters
        categories={categories}
        filters={filters}
        setFilters={setFilters}
        shown={filteredResources.length}
        total={resources.length}
        mapsReady={isLoaded}
        onPlaceSelected={handlePlaceSelected}
      />

      <div className="live-map-canvas">

        {(!isLoaded || loading) && (
          <div className="live-map-loading">
            {subError
              ? "Couldn't load resources. Please try again."
              : !isLoaded
                ? "Loading map…"
                : "Loading resources…"}
          </div>
        )}

        {isLoaded && (
          <GoogleMap
            mapContainerStyle={MAP_CONTAINER_STYLE}
            center={initialCenter}
            zoom={initialZoom}
            options={MAP_OPTIONS}
            onLoad={onMapLoad}
            onUnmount={onMapUnmount}
            onClick={() => setSelected(null)}
          >
            {filteredResources.map((resource) => (
              <MapMarker
                key={resource.id}
                resource={resource}
                focused={!!focusedAsset && resource.id === focusedAsset.id}
                onClick={setSelected}
              />
            ))}

            {selectedLive && selectedPos && (
              <InfoWindow
                position={{ lat: selectedPos.lat, lng: selectedPos.lng }}
                onCloseClick={() => setSelected(null)}
              >
                <div className="live-map-infowindow">
                  <h4>{selectedLive.resourceName || "Unnamed resource"}</h4>

                  {/* Stage 4o Phase 2: live "currently at" line. Shows a
                      source badge + relative time when the asset is away
                      from home; a plain "at home location" otherwise. */}
                  <div className="live-map-current">
                    <span className="live-map-current-label">Currently at:</span>{" "}
                    <strong>{selectedPos.buildingName}</strong>
                    {!selectedPos.isHome && (
                      <span className="live-map-source-badge">
                        {sourceLabel(selectedPos.source)}
                      </span>
                    )}
                    {selectedPos.updatedAt && (
                      <span className="live-map-current-time">
                        {" — "}{relativeTime(selectedPos.updatedAt, Date.now())}
                      </span>
                    )}
                  </div>

                  <dl>
                    <dt>Asset code</dt>
                    <dd>{selectedLive.assetCode || selectedLive.id}</dd>
                    <dt>Category</dt>
                    <dd>{selectedLive.category || "—"}</dd>
                    <dt>Condition</dt>
                    <dd>{conditionLabel(selectedLive.condition) || "—"}</dd>
                    <dt>Home</dt>
                    <dd>{formatLocation(selectedLive.location)}</dd>
                    {selectedLive.capacity ? (
                      <>
                        <dt>Capacity</dt>
                        <dd>{selectedLive.capacity}</dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}

        <div className="live-map-footer">
          Pins show each asset&apos;s current location — updated live by QR
          check-in (Phase 2). Booking, transfer and maintenance moves are
          tracked automatically in Phase 3.
        </div>

      </div>
    </div>
  );
}
