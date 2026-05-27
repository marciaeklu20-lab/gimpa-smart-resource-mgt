"use client";

import React from "react";

import { FaSearch } from "react-icons/fa";

export default function CampusResourceControls({
  allowedRoles,
  userRole,
  categories,
  selectedCategory,
  setSelectedCategory,
  selectedType,
  setSelectedType,
  searchTerm,
  setSearchTerm,
  typesForCategory,
  setShowModal
}) {

  return (

    <div className="campus-resource-controls">

      {allowedRoles.includes(
        userRole
      ) && (

        <button
          className="add-resource-btn"
          onClick={() =>
            setShowModal(true)
          }
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
          onChange={(e) =>
            setSearchTerm(
              e.target.value
            )
          }
        />

      </div>

      <select
        className="resource-category"
        value={selectedCategory}
        onChange={(e) => {

          setSelectedCategory(
            e.target.value
          );

          setSelectedType("");

        }}
      >

        <option value="">
          All Categories
        </option>

        {categories.map((cat) => (

          <option
            key={cat}
          >
            {cat}
          </option>

        ))}

      </select>

      <select
        className="resource-type"
        value={selectedType}
        onChange={(e) =>
          setSelectedType(
            e.target.value
          )
        }
      >

        <option value="">
          All Types
        </option>

        {typesForCategory.map((type) => (

          <option key={type}>
            {type}
          </option>

        ))}

      </select>

    </div>

  );

}