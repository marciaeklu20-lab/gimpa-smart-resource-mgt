"use client";

import { FaQrcode } from "react-icons/fa";
import { BsQrCodeScan } from "react-icons/bs";

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

  resourceName,
  setResourceName,
  description,
  setDescription,
  quantity,
  setQuantity,
  capacity,
  setCapacity
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

      {/* Image */}
      <div className="form-group">
        <label>Upload Image</label>
        <input type="file"/>
      </div>

    </>
  );
}