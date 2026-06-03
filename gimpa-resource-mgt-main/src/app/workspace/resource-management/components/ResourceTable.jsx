"use client";

import React from "react";

import {
  lifecycleLabel,
  conditionLabel,
  lifecyclePillStyle,
  conditionPillStyle
} from "@/app/lib/resourceMeta";

// Short location string for the master table — building + room is
// enough at a glance. The full breadcrumb (campus › building › floor ›
// room) lives in the detail panel.
const shortLocation = (loc) => {
  if (!loc || typeof loc !== "object") return "—";
  const parts = ["building", "room"]
    .map((k) => (loc[k] || "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return (loc.campus || "").trim() || "—";
};

export default function ResourceTable({
  filteredResources,
  selectedAssetId,
  onSelectAsset
}) {

  return (

    <div className="resource-table-container">

      <table className="resource-table resource-table-master">

        <thead>
          <tr>
            <th>Status</th>
            <th>Name</th>
            <th>Asset Code</th>
            <th>Condition</th>
            <th>Location</th>
            <th>Custodian</th>
          </tr>
        </thead>

        <tbody>

          {filteredResources.length === 0 ? (

            <tr>
              <td colSpan="6" className="no-resources">
                No resources found
              </td>
            </tr>

          ) : (

            filteredResources.map((resource) => {

              const status = resource.lifecycleStatus || "active";
              const condition = resource.condition || "good";
              const isSelected = selectedAssetId === resource.id;

              return (

                <tr
                  key={resource.id}
                  className={`resource-row ${isSelected ? "resource-row-selected" : ""}`}
                  onClick={() => onSelectAsset && onSelectAsset(resource.id)}
                >

                  <td>
                    <span className={`pill ${lifecyclePillStyle(status)}`}>
                      {lifecycleLabel(status)}
                    </span>
                  </td>

                  <td className="resource-name">
                    {resource.resourceName}
                  </td>

                  <td>{resource.assetCode}</td>

                  <td>
                    <span className={`pill ${conditionPillStyle(condition)}`}>
                      {conditionLabel(condition)}
                    </span>
                  </td>

                  <td>{shortLocation(resource.location)}</td>

                  <td>{resource.custodianName || "—"}</td>

                </tr>

              );

            })

          )}

        </tbody>

      </table>

    </div>

  );

}
