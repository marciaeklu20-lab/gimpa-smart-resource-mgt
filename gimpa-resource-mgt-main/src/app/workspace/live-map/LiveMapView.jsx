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

import { useEffect, useMemo, useState } from "react";

import { GoogleMap, InfoWindow, useJsApiLoader } from "@react-google-maps/api";

import {
  GIMPA_CENTER,
  DEFAULT_ZOOM,
  buildingCoordsForResource
} from "@/app/lib/gimpaBuildingCoordinates";
import { conditionLabel, formatLocation } from "@/app/lib/resourceMeta";

import { subscribeResources } from "./subscribeResources";
import MapMarker from "./MapMarker";
import MapFilters from "./MapFilters";

import "@/app/styles/live-map/LiveMap.css";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" };
const MAP_OPTIONS = {
  mapTypeId: "hybrid", // satellite imagery + road/label overlay
  streetViewControl: false,
  fullscreenControl: true,
  mapTypeControl: true
};

const DEFAULT_FILTERS = { search: "", categories: [], condition: "all" };

export default function LiveMapView({ currentUser }) {

  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subError, setSubError] = useState(null);
  const [selected, setSelected] = useState(null); // resource for InfoWindow
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const { isLoaded, loadError } = useJsApiLoader({
    id: "gimpa-live-map",
    googleMapsApiKey: API_KEY || ""
  });

  // Live subscription — unsubscribes on unmount (no leak when the user
  // navigates to another sidebar surface).
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
  // change) and close it if its resource is filtered out.
  const selectedLive = useMemo(() => {
    if (!selected) return null;
    return filteredResources.find((r) => r.id === selected.id) || null;
  }, [selected, filteredResources]);

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
            center={GIMPA_CENTER}
            zoom={DEFAULT_ZOOM}
            options={MAP_OPTIONS}
            onClick={() => setSelected(null)}
          >
            {filteredResources.map((resource) => (
              <MapMarker
                key={resource.id}
                resource={resource}
                onClick={setSelected}
              />
            ))}

            {selectedLive && (
              <InfoWindow
                position={buildingCoordsForResource(selectedLive)}
                onCloseClick={() => setSelected(null)}
              >
                <div className="live-map-infowindow">
                  <h4>{selectedLive.resourceName || "Unnamed resource"}</h4>
                  <dl>
                    <dt>Asset code</dt>
                    <dd>{selectedLive.assetCode || selectedLive.id}</dd>
                    <dt>Category</dt>
                    <dd>{selectedLive.category || "—"}</dd>
                    <dt>Condition</dt>
                    <dd>{conditionLabel(selectedLive.condition) || "—"}</dd>
                    <dt>Location</dt>
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
          Locations shown reflect home assignments. Real-time movement
          tracking ships in Phase 2 (QR check-in) and Phase 3
          (booking/transfer/maintenance event listeners).
        </div>

      </div>
    </div>
  );
}
