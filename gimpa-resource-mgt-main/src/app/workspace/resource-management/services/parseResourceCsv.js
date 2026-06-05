"use client";

// Stage 4i: pure CSV parsing + per-row validation for the Bulk
// Import wizard. Returns:
//   { rows, errors, warnings }
// where:
//   rows[i].normalized: the resource object ready to write (or null
//                       if the row has fatal errors)
//   rows[i].rawIndex:   1-based row number from the CSV (header is
//                       row 1; first data row is row 2)
//   rows[i].errors:     array of { field, message }
//   rows[i].warnings:   array of { field, message }
//
// Server-side checks (assetCode already exists in Firestore,
// custodianEmail resolves to a user) live in bulkImportResources.js.
// This file only does what we can prove from the CSV + the current
// user's role.

import Papa from "papaparse";

import {
  ALL_CATEGORIES,
  responsibleRoleForCategory,
  isResourceManager
} from "@/app/lib/categoryResponsibility";

import {
  LIFECYCLE_STATUSES,
  CONDITIONS,
  DEFAULT_LIFECYCLE_STATUS,
  DEFAULT_CONDITION
} from "@/app/lib/resourceMeta";

const VALID_LIFECYCLE = new Set(LIFECYCLE_STATUSES.map((s) => s.value));
const VALID_CONDITION = new Set(CONDITIONS.map((c) => c.value));
const VALID_CATEGORY  = new Set(ALL_CATEGORIES);

// ---------------------------------------------------------------------
// CSV column whitelist + alias-friendly header normalization.
// ---------------------------------------------------------------------

const HEADER_ALIASES = {
  // Canonical → variants we tolerate from operators who hand-edit the
  // template. Lower-cased, whitespace-collapsed comparison.
  assetcode:        "assetCode",
  resourcename:     "resourceName",
  category:         "category",
  type:             "type",
  description:      "description",
  quantity:         "quantity",
  capacity:         "capacity",
  lifecyclestatus:  "lifecycleStatus",
  condition:        "condition",
  locationcampus:   "locationCampus",
  locationbuilding: "locationBuilding",
  locationfloor:    "locationFloor",
  locationroom:     "locationRoom",
  custodianemail:   "custodianEmail",
  acquisitiondate:  "acquisitionDate",
  acquisitioncost:  "acquisitionCost",
  warrantyexpiry:   "warrantyExpiry",
  vendor:           "vendor"
};

const normalizeHeader = (h) => {
  const key = String(h || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return HEADER_ALIASES[key] || null;
};

// ---------------------------------------------------------------------
// Field parsers — each returns { value, error?, warning? }
// ---------------------------------------------------------------------

const requireString = (raw, field) => {
  const v = (raw ?? "").toString().trim();
  if (!v) return { error: { field, message: `${field} is required` } };
  return { value: v };
};

const optionalString = (raw) => {
  const v = (raw ?? "").toString().trim();
  return v ? { value: v } : { value: null };
};

const parseInEnum = (raw, field, valid, fallback) => {
  const v = (raw ?? "").toString().trim();
  if (!v) return { value: fallback };
  if (!valid.has(v)) {
    return {
      error: {
        field,
        message: `${field} '${v}' is not one of: ${[...valid].join(", ")}`
      }
    };
  }
  return { value: v };
};

const parseDateOrNull = (raw, field) => {
  const v = (raw ?? "").toString().trim();
  if (!v) return { value: null };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    return { error: { field, message: `${field} '${v}' is not a valid date (use YYYY-MM-DD)` } };
  }
  return { value: d };
};

const parseNumberOrNull = (raw, field) => {
  const v = (raw ?? "").toString().trim();
  if (!v) return { value: null };
  const n = Number(v);
  if (!Number.isFinite(n)) {
    return { error: { field, message: `${field} '${v}' is not a number` } };
  }
  return { value: n };
};

// ---------------------------------------------------------------------
// buildLocation — only return an object if at least one part is set, to
// match the convention from AddResourceForm.
// ---------------------------------------------------------------------

const buildLocation = ({ campus, building, floor, room }) => {
  const parts = {
    campus:   (campus   || "").trim(),
    building: (building || "").trim(),
    floor:    (floor    || "").trim(),
    room:     (room     || "").trim()
  };
  if (!parts.campus && !parts.building && !parts.floor && !parts.room) {
    return null;
  }
  return parts;
};

// ---------------------------------------------------------------------
// validateRow — runs every per-row check we can do offline. Server-side
// checks (existing assetCode, custodianEmail resolution) happen in
// bulkImportResources.js.
// ---------------------------------------------------------------------

const validateRow = (raw, rawIndex, currentUserRole, seenAssetCodes) => {
  const errors = [];
  const warnings = [];

  // assetCode — required, must be unique within the CSV.
  const ac = requireString(raw.assetCode, "assetCode");
  if (ac.error) errors.push(ac.error);
  else if (seenAssetCodes.has(ac.value)) {
    errors.push({
      field: "assetCode",
      message: `Duplicate assetCode '${ac.value}' within this CSV`
    });
  } else {
    seenAssetCodes.add(ac.value);
  }

  // resourceName — required.
  const rn = requireString(raw.resourceName, "resourceName");
  if (rn.error) errors.push(rn.error);

  // category — required, must be in the valid set.
  const cat = requireString(raw.category, "category");
  if (cat.error) errors.push(cat.error);
  else if (!VALID_CATEGORY.has(cat.value)) {
    errors.push({
      field: "category",
      message: `Category '${cat.value}' is not in the valid set`
    });
  }

  // type — required.
  const ty = requireString(raw.type, "type");
  if (ty.error) errors.push(ty.error);

  // Lifecycle + condition — enum or default.
  const lc = parseInEnum(
    raw.lifecycleStatus,
    "lifecycleStatus",
    VALID_LIFECYCLE,
    DEFAULT_LIFECYCLE_STATUS
  );
  if (lc.error) errors.push(lc.error);

  const cn = parseInEnum(
    raw.condition,
    "condition",
    VALID_CONDITION,
    DEFAULT_CONDITION
  );
  if (cn.error) errors.push(cn.error);

  // Quantity rule: Facilities → must be empty/null; else default 1.
  let quantity = null;
  if (cat.value === "Facilities") {
    const q = (raw.quantity ?? "").toString().trim();
    if (q) {
      warnings.push({
        field: "quantity",
        message: "Quantity ignored for Facilities — left null"
      });
    }
    quantity = null;
  } else {
    const q = (raw.quantity ?? "").toString().trim();
    if (!q) {
      quantity = 1;
    } else {
      const n = Number(q);
      if (!Number.isFinite(n)) {
        errors.push({
          field: "quantity",
          message: `quantity '${q}' is not a number`
        });
      } else {
        quantity = n;
      }
    }
  }

  // Dates + cost.
  const acq = parseDateOrNull(raw.acquisitionDate, "acquisitionDate");
  if (acq.error) errors.push(acq.error);
  const warr = parseDateOrNull(raw.warrantyExpiry, "warrantyExpiry");
  if (warr.error) errors.push(warr.error);
  const cost = parseNumberOrNull(raw.acquisitionCost, "acquisitionCost");
  if (cost.error) errors.push(cost.error);

  // Responsibility partitioning. If the user is a Resource Manager
  // (not super_admin / Secretariat Admin / IT Officer-as-admin),
  // reject any row whose derived responsibleRole isn't theirs.
  const derived = cat.value ? responsibleRoleForCategory(cat.value) : null;
  if (currentUserRole && isResourceManager(currentUserRole)) {
    if (derived && derived !== currentUserRole) {
      errors.push({
        field: "category",
        message: `Outside your responsibility area — '${cat.value}' is owned by ${derived}`
      });
    }
  }

  // Build the normalized row — only when no fatal errors. Even
  // warnings keep the row eligible for import.
  const fatal = errors.length > 0;
  let normalized = null;

  if (!fatal) {
    const desc       = optionalString(raw.description).value;
    const capacity   = optionalString(raw.capacity).value;
    const custodianEmail = optionalString(raw.custodianEmail).value;
    const vendor     = optionalString(raw.vendor).value;

    normalized = {
      assetCode:       ac.value,
      resourceName:    rn.value,
      category:        cat.value,
      type:            ty.value,
      description:     desc,
      quantity,
      capacity,
      lifecycleStatus: lc.value,
      condition:       cn.value,
      location: buildLocation({
        campus:   raw.locationCampus,
        building: raw.locationBuilding,
        floor:    raw.locationFloor,
        room:     raw.locationRoom
      }),
      custodianEmail,
      acquisitionDate: acq.value,
      acquisitionCost: cost.value,
      warrantyExpiry:  warr.value,
      vendor,
      responsibleRole: derived
    };
  }

  return { rawIndex, normalized, errors, warnings };
};

// ---------------------------------------------------------------------
// parseResourceCsv — public entry point.
//
// Args:
//   file:            File from <input type="file"> or a string.
//   currentUserRole: required for responsibility partitioning.
//
// Resolves with { rows, errors, warnings }:
//   rows:     all parsed rows including invalid ones (UI shows them
//             with their errors in the preview table)
//   errors:   CSV-level errors (missing required column, parse errors)
//   warnings: CSV-level warnings (unknown columns silently dropped)
// ---------------------------------------------------------------------

export const REQUIRED_COLUMNS = ["assetCode", "resourceName", "category", "type"];

export const ALL_COLUMNS = [
  "assetCode",
  "resourceName",
  "category",
  "type",
  "description",
  "quantity",
  "capacity",
  "lifecycleStatus",
  "condition",
  "locationCampus",
  "locationBuilding",
  "locationFloor",
  "locationRoom",
  "custodianEmail",
  "acquisitionDate",
  "acquisitionCost",
  "warrantyExpiry",
  "vendor"
];

export const parseResourceCsv = (file, currentUserRole) =>
  new Promise((resolve) => {

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => normalizeHeader(h) || `__unknown__${h}`,

      complete: (result) => {

        const csvErrors = [];
        const csvWarnings = [];

        // Header sanity. The transform above produces `__unknown__XYZ`
        // for any header we don't recognize — surface those once as a
        // warning so operators know their column was dropped.
        const headers = result.meta.fields || [];
        const unknownHeaders = headers.filter((h) => h.startsWith("__unknown__"));
        if (unknownHeaders.length > 0) {
          csvWarnings.push({
            field: "_csv",
            message: `Ignored unknown columns: ${
              unknownHeaders.map((h) => h.replace("__unknown__", "")).join(", ")
            }`
          });
        }

        // Required columns must be present.
        const missingRequired = REQUIRED_COLUMNS.filter(
          (c) => !headers.includes(c)
        );
        if (missingRequired.length > 0) {
          csvErrors.push({
            field: "_csv",
            message: `Missing required columns: ${missingRequired.join(", ")}`
          });
        }

        // Bubble up any PapaParse-level row errors.
        if (result.errors && result.errors.length > 0) {
          for (const e of result.errors) {
            csvErrors.push({
              field: "_csv",
              message: `Row ${e.row != null ? e.row + 2 : "?"}: ${e.message}`
            });
          }
        }

        // Short-circuit when the CSV is structurally unusable.
        if (csvErrors.length > 0 && missingRequired.length > 0) {
          resolve({
            rows: [],
            errors: csvErrors,
            warnings: csvWarnings
          });
          return;
        }

        // Per-row validation.
        const seenAssetCodes = new Set();
        const rows = (result.data || []).map((raw, i) =>
          validateRow(raw, i + 2, currentUserRole, seenAssetCodes)
        );

        resolve({
          rows,
          errors: csvErrors,
          warnings: csvWarnings
        });
      },

      error: (err) => {
        resolve({
          rows: [],
          errors: [{ field: "_csv", message: `CSV parse failed: ${err.message}` }],
          warnings: []
        });
      }
    });
  });

// ---------------------------------------------------------------------
// buildTemplateCsv — used by the "Download template" link.
// ---------------------------------------------------------------------

export const buildTemplateCsv = () => {
  const rows = [
    {
      assetCode:        "GIMPA-01-01-901",
      resourceName:     "Lecture Hall A",
      category:         "Facilities",
      type:             "Lecture Halls",
      description:      "Main lecture hall, ground floor",
      quantity:         "",
      capacity:         "120",
      lifecycleStatus:  "active",
      condition:        "good",
      locationCampus:   "Greenhill",
      locationBuilding: "Block A",
      locationFloor:    "Ground",
      locationRoom:     "A101",
      custodianEmail:   "",
      acquisitionDate:  "",
      acquisitionCost:  "",
      warrantyExpiry:   "",
      vendor:           ""
    },
    {
      assetCode:        "GIMPA-02-01-902",
      resourceName:     "Projector — Epson EB-X41",
      category:         "Electronics & Electrical Equipment",
      type:             "Projectors",
      description:      "Wall-mounted projector",
      quantity:         "1",
      capacity:         "",
      lifecycleStatus:  "active",
      condition:        "good",
      locationCampus:   "Greenhill",
      locationBuilding: "Block A",
      locationFloor:    "1",
      locationRoom:     "A201",
      custodianEmail:   "",
      acquisitionDate:  "2024-09-12",
      acquisitionCost:  "4200",
      warrantyExpiry:   "2026-09-12",
      vendor:           "EpsonGH"
    },
    {
      assetCode:        "GIMPA-06-08-903",
      resourceName:     "Cordless Drill — 18V",
      category:         "Tools & Maintenance Equipment",
      type:             "Drills",
      description:      "Battery + charger included",
      quantity:         "2",
      capacity:         "",
      lifecycleStatus:  "active",
      condition:        "excellent",
      locationCampus:   "Greenhill",
      locationBuilding: "Store Room",
      locationFloor:    "Ground",
      locationRoom:     "S1",
      custodianEmail:   "",
      acquisitionDate:  "2025-02-04",
      acquisitionCost:  "950",
      warrantyExpiry:   "2026-02-04",
      vendor:           "ToolHub"
    }
  ];

  return Papa.unparse({
    fields: ALL_COLUMNS,
    data: rows.map((r) => ALL_COLUMNS.map((c) => r[c] ?? ""))
  });
};
