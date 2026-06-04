"use client";

import { FaQrcode } from "react-icons/fa";
import { BsQrCodeScan } from "react-icons/bs";

import {
  LIFECYCLE_STATUSES,
  CONDITIONS
} from "@/app/lib/resourceMeta";

import "@/app/styles/workspace/add-resource.css";

export default function ResourceFields({
  category,
  types = [],
  categories = {},
  handleCategoryChange,
  handleTypeChange,
  generateCode,
  assetCode,
  selectedType,
  responsibleRole = "",

  resourceName,
  setResourceName,
  description,
  setDescription,
  quantity,
  setQuantity,
  capacity,
  setCapacity,

  lifecycleStatus,
  setLifecycleStatus,
  condition,
  setCondition,
  locationCampus,
  setLocationCampus,
  locationBuilding,
  setLocationBuilding,
  locationFloor,
  setLocationFloor,
  locationRoom,
  setLocationRoom,
  custodianId,
  setCustodianId,
  staffOptions = [],
  acquisitionDate,
  setAcquisitionDate,
  acquisitionCost,
  setAcquisitionCost,
  warrantyExpiry,
  setWarrantyExpiry,
  vendor,
  setVendor
}) {

  const showQuantity = category !== "Facilities";

  return (
    <>

      {/* Resource Name */}
      <div className="form-group">
        <label>Resource Name</label>
        <input
          type="text"
          placeholder="Projector"
          value={resourceName}
          onChange={(e) => setResourceName(e.target.value)}
          required
        />
      </div>

      {/* Category */}
      <div className="form-group">
        <label>Category</label>

        <select value={category} onChange={handleCategoryChange}>
          <option value="">Select Category</option>

          {Object.keys(categories).map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}

        </select>
        {Object.keys(categories).length === 0 && (
          <div className="form-hint">
            No categories available — you don&apos;t manage any resource type.
          </div>
        )}
      </div>

      {/* Responsible Role (Stage 4e.7) — auto-derived from category,
          displayed read-only so the operator can see who will own the
          resource going forward. */}
      <div className="form-group">
        <label>Responsible Role</label>
        <input
          type="text"
          value={responsibleRole || "— select a category —"}
          readOnly
        />
      </div>

      {/* Type */}
      <div className="form-group">
        <label>Type</label>

        {category === "Other" ? (

          <input
            type="text"
            placeholder="Enter resource type"
            value={selectedType}
            onChange={(e) => handleTypeChange(e.target.value)}
          />

        ) : (

          <select
            value={selectedType}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            <option value="">Select Type</option>

            {(types || []).map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}

          </select>

        )}

      </div>

      {/* Asset Code */}
      <div className="form-group">
        <label>Asset Code</label>

        <div className="asset-code-row">

          <input
            type="text"
            value={assetCode}
            placeholder="GIMPA-01-01-0001"
            readOnly
          />

          <button
            type="button"
            onClick={generateCode}
            className="generate-btn"
          >
            <FaQrcode /> Generate
          </button>

          <button
            type="button"
            className="scan-btn"
          >
            <BsQrCodeScan /> Scan
          </button>

        </div>

      </div>

      {/* Description */}
      <div className="form-group">
        <label>Description</label>
        <textarea
          placeholder="Describe the resource"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        ></textarea>
      </div>

      {/* Quantity (Hidden for Facilities) */}
      {showQuantity && (
        <div className="form-group">
          <label>Quantity</label>
          <input
            type="number"
            placeholder="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      )}

      {/* Capacity */}
      <div className="form-group">
        <label>Capacity (optional)</label>
        <input
          type="number"
          placeholder="120"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
      </div>

      {/* Lifecycle Status (Stage 4a) */}
      <div className="form-group">
        <label>Lifecycle Status</label>
        <select
          value={lifecycleStatus}
          onChange={(e) => setLifecycleStatus(e.target.value)}
        >
          {LIFECYCLE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Condition (Stage 4a) */}
      <div className="form-group">
        <label>Condition</label>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
        >
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Location (Stage 4a) — 4 optional parts */}
      <div className="form-group">
        <label>Location — Campus (optional)</label>
        <input
          type="text"
          placeholder="Main Campus"
          value={locationCampus}
          onChange={(e) => setLocationCampus(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Location — Building (optional)</label>
        <input
          type="text"
          placeholder="GIMPA Block A"
          value={locationBuilding}
          onChange={(e) => setLocationBuilding(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Location — Floor (optional)</label>
        <input
          type="text"
          placeholder="Floor 1"
          value={locationFloor}
          onChange={(e) => setLocationFloor(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Location — Room (optional)</label>
        <input
          type="text"
          placeholder="Room 101"
          value={locationRoom}
          onChange={(e) => setLocationRoom(e.target.value)}
        />
      </div>

      {/* Custodian (Stage 4a) */}
      <div className="form-group">
        <label>Custodian (optional)</label>
        <select
          value={custodianId}
          onChange={(e) => setCustodianId(e.target.value)}
        >
          <option value="">Unassigned</option>
          {staffOptions.map((s) => (
            <option key={s.uid} value={s.uid}>
              {s.fullName || s.email} — {s.role}
            </option>
          ))}
        </select>
      </div>

      {/* Acquisition (Stage 4a) */}
      <div className="form-group">
        <label>Acquisition Date (optional)</label>
        <input
          type="date"
          value={acquisitionDate}
          onChange={(e) => setAcquisitionDate(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Acquisition Cost (GHS, optional)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          value={acquisitionCost}
          onChange={(e) => setAcquisitionCost(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Warranty Expiry (optional)</label>
        <input
          type="date"
          value={warrantyExpiry}
          onChange={(e) => setWarrantyExpiry(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label>Vendor (optional)</label>
        <input
          type="text"
          placeholder="HP Ghana"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
        />
      </div>

      {/* Image */}
      <div className="form-group">
        <label>Upload Image</label>
        <input type="file"/>
      </div>

    </>
  );
}
