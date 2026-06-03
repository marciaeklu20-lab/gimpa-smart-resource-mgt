"use client";

import React from "react";

import {
  canBookResource
} from "../services/permissions";

import {
  isBookable,
  lifecycleLabel
} from "@/app/lib/resourceMeta";

export default function ResourceTable({
  filteredResources,
  currentUserRole,
  setSelectedResource
}) {

  return (

    <div className="resource-table-container">

      <table className="resource-table">

        <thead>

          <tr>

            <th>Asset Code</th>

            <th>Resource Name</th>

            <th>Category</th>

            <th>Type</th>

            <th>Quantity</th>

            <th>Capacity</th>

            <th>Description</th>

            <th>Booking</th>

          </tr>

        </thead>

        <tbody>

          {filteredResources.length === 0 ? (

            <tr>

              <td
                colSpan="8"
                className="no-resources"
              >
                No resources found
              </td>

            </tr>

          ) : (

            filteredResources.map(
              (resource) => (

              <tr key={resource.id}>

                <td>
                  {resource.assetCode}
                </td>

                <td>
                  {resource.resourceName}
                </td>

                <td>
                  {resource.category}
                </td>

                <td>
                  {resource.type}
                </td>

                <td>
                  {resource.quantity || "-"}
                </td>

                <td>
                  {resource.capacity || "-"}
                </td>

                <td>
                  {resource.description || "-"}
                </td>

                <td>

                  {canBookResource(currentUserRole) && (
                    isBookable(resource) ? (
                      <button
                        className="book-resource-btn"
                        onClick={() => setSelectedResource(resource)}
                      >
                        Book
                      </button>
                    ) : (
                      <span
                        className="resource-status-unavailable"
                        title={`Status: ${lifecycleLabel(resource.lifecycleStatus)}`}
                      >
                        {lifecycleLabel(resource.lifecycleStatus)}
                      </span>
                    )
                  )}

                </td>

              </tr>

            ))

          )}

        </tbody>

      </table>

    </div>

  );

}