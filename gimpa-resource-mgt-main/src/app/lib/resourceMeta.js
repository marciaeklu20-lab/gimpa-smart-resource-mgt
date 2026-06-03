// Resource lifecycle + condition enums.
//
// Mirrored manually in scripts/seedDemoData.js — keep in sync.

export const LIFECYCLE_STATUSES = [
  { value: "active", label: "Active" },
  { value: "in_maintenance", label: "In maintenance" },
  { value: "retired", label: "Retired" },
  { value: "disposed", label: "Disposed" },
  { value: "lost", label: "Lost" }
];

export const CONDITIONS = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
  { value: "out_of_service", label: "Out of service" }
];

export const DEFAULT_LIFECYCLE_STATUS = "active";
export const DEFAULT_CONDITION = "good";

export const isBookable = (resource) => {
  // Resources written before Stage 4a have no lifecycleStatus — treat
  // as active (the default for legacy records).
  const status = resource?.lifecycleStatus || DEFAULT_LIFECYCLE_STATUS;
  return status === "active";
};

export const lifecycleLabel = (value) => {
  return LIFECYCLE_STATUSES.find((s) => s.value === value)?.label || value;
};
