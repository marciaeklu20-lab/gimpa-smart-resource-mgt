"use client";

import React from "react";

import { FaSearch } from "react-icons/fa";

// Stage 4e.7: allowedRoles is now derived from RESOURCE_MANAGERS +
// super_admin upstream. Anyone outside that list — including
// Maintenance Staff / Maintenance Admin — sees the page read-only
// and the button stays hidden.
export default function CampusResourceControls({
  allowedRoles,
  userRole,
  selectedType,
  setSelectedType,
  searchTerm,
  setSearchTerm,
  typesForCategory,
  setShowModal
}) {

  return (

    <div className="campus-resource-controls">

      {allowedRoles.includes(userRole) && (

        <button
          className="add-resource-btn"
          onClick={() => setShowModal(true)}
        >
          + Add Resource
        </button>

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
