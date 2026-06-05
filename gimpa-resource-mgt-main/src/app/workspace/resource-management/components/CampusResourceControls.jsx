"use client";

import React from "react";

import { FaSearch } from "react-icons/fa";

// Stage 4e.7: allowedRoles is now derived from RESOURCE_MANAGERS +
// super_admin upstream. Anyone outside that list — including
// Maintenance Staff / Maintenance Admin — sees the page read-only
// and the button stays hidden.
//
// Stage 4i: "Bulk Import" button sits beside "+ Add Resource" with
// the same gating list. Row-level responsibility filtering happens
// inside the modal (parseResourceCsv); the button itself just opens
// the wizard.
export default function CampusResourceControls({
  allowedRoles,
  userRole,
  selectedType,
  setSelectedType,
  searchTerm,
  setSearchTerm,
  typesForCategory,
  setShowModal,
  setShowBulkImport
}) {

  return (

    <div className="campus-resource-controls">

      {allowedRoles.includes(userRole) && (

        <>

          <button
            className="add-resource-btn"
            onClick={() => setShowModal(true)}
          >
            + Add Resource
          </button>

          <button
            type="button"
            className="bulk-import-btn"
            onClick={() => setShowBulkImport(true)}
          >
            Bulk Import
          </button>

        </>

      )}

      <div className="resource-search-wrapper">

        <FaSearch className="search-icon" />

        <input
          type="text"
          placeholder="Search by code, name, category or type..."
          className="resource-search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

      </div>

      {/* Category filter moved to the card row below (Stage 4b).
          Type dropdown stays — it still narrows within whatever
          category the cards select. */}
      <select
        className="resource-type"
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
      >

        <option value="">All Types</option>

        {typesForCategory.map((type) => (
          <option key={type}>{type}</option>
        ))}

      </select>

    </div>

  );

}
