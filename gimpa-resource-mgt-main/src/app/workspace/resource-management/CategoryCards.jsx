"use client";

import React from "react";

// Canonical category list. Mirrors the keys of the `categories` object
// in AddResourceForm — keep these two in sync. Order here is also the
// card display order.
const CATEGORIES = [
  "Facilities",
  "Electronics & Electrical Equipment",
  "Furniture",
  "Vehicles & Transport",
  "Office Supplies & Stationery",
  "Tools & Maintenance Equipment",
  "Other"
];

export default function CategoryCards({
  selectedCategory,
  onSelectCategory,
  resources = []
}) {

  const countFor = (cat) =>
    resources.filter((r) => r.category === cat).length;

  const isAllSelected = selectedCategory === "" || selectedCategory == null;

  return (
    <div className="category-cards-row">

      <button
        type="button"
        className={`category-card ${isAllSelected ? "active" : ""}`}
        onClick={() => onSelectCategory("")}
      >
        <span className="category-card-label">All</span>
        <span className="category-card-count">{resources.length}</span>
      </button>

      {CATEGORIES.map((cat) => {
        const active = selectedCategory === cat;
        return (
          <button
            key={cat}
            type="button"
            className={`category-card ${active ? "active" : ""}`}
            // Clicking the active card clears the filter (back to "All").
            onClick={() => onSelectCategory(active ? "" : cat)}
          >
            <span className="category-card-label">{cat}</span>
            <span className="category-card-count">{countFor(cat)}</span>
          </button>
        );
      })}

    </div>
  );
}
