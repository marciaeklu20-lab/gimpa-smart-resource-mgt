"use client";

import { useState } from "react";
import ResourceFields from "./ResourceFields";
import { IoCloseOutline } from "react-icons/io5";
import "@/app/styles/workspace/add-resource.css";

import { getFirestore, doc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import app from "@/firebase/config";

export default function AddResourceForm({ closeModal }) {

  const db = getFirestore(app);

  const [category, setCategory] = useState("");
  const [types, setTypes] = useState([]);
  const [assetCode, setAssetCode] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [capacity, setCapacity] = useState("");

  const categories = {
    "Facilities": [
      
      "Lecture Halls",
      "Conference Rooms",
      "Auditoriums",
      "Halls",
      "Outdoor Spaces",
      "Office Supplies & Stationary",
      "Tools & Maintenance Equipment"
    ],
    "Electronics & Electrical Equipment": [
      "Projectors",
      "Computers",
      "Printers",
      "Photocopiers",
      "Shredders",
      "Binding Machines",
      "Laminators",
      "Microphones",
      "Lights & Cables",
      "IT & Network Infrastructure",
      "AV Systems(e.g.,Speakers)"
    ],
    "Furniture": [
      "Chairs",
      "Tables",
      "Desks",
      "Cabinets"
    ],
    "Vehicles & Transport": [
      "Cars",
      "Vans",
      "Buses"
    ],
  "Office Supplies & Stationery": [
    "Pens",
    "Pencils",
    "Markers",
    "Highlighters",
    "Notebooks",
    "Sticky Notes",
    "Envelopes",
    "Folders",
    "Files",
    "Paper Reams",
    "Staplers",
    "Staple Pins",
    "Paper Clips",
    "Rubber Bands",
    "Scissors",
    "Tape Dispensers",
    "Correction Fluid",
    "Whiteboard Markers",
    "Whiteboards",
    "Notice Boards"
    ],

"Tools & Maintenance Equipment": [
  "Hammers",
  "Screwdrivers",
  "Wrenches",
  "Spanners",
  "Pliers",
  "Drills",
  "Electric Drills",
  "Ladders",
  "Tool Kits",
  "Wheelbarrows",
  "Measuring Tapes",
  "Voltage Testers",
  "Multimeters",
  "Extension Cables",
  "Power Strips",
  "Soldering Irons",
  "Cutting Machines",
  "Cleaning Machines",
  "Pressure Washers",
  "Generators"
],
    "Other": []
  };

  const categoryCodes = {
    "Facilities": "01",
    "Electronics & Electrical Equipment": "02",
    "Furniture": "03",
    "Vehicles & Transport": "04",
    "Office Supplies & Stationery": "05",
  "Tools & Maintenance Equipment": "06",
    "Other": "07"
  };

  const handleCategoryChange = (e) => {
    const selected = e.target.value;

    setCategory(selected);
    setTypes(categories[selected] || []);
    setSelectedType("");
    setAssetCode("");
  };

  const handleTypeChange = (type) => {
    setSelectedType(type);
    setAssetCode("");
  };

  const generateCode = async () => {

  if (!category || !selectedType) {
    alert("Please select category and type first");
    return;
  }

  const categoryCode = categoryCodes[category] || "00";

  const typeIndex = (types || []).indexOf(selectedType) + 1;
  const typeCode = String(typeIndex).padStart(2, "0");

  try {

    const q = query(
      collection(db, "resources"),
      where("category", "==", category),
      where("type", "==", selectedType)
    );

    const snapshot = await getDocs(q);

    let maxSequence = 0;

    snapshot.forEach((doc) => {
      const code = doc.data().assetCode;

      if (code) {
        const parts = code.split("-");
        const seq = parseInt(parts[3], 10);

        if (seq > maxSequence) {
          maxSequence = seq;
        }
      }
    });

    const nextSequence = maxSequence + 1;

    const sequence = String(nextSequence).padStart(3, "0");

    const code = `GIMPA-${categoryCode}-${typeCode}-${sequence}`;

    setAssetCode(code);

  } catch (error) {
    console.error("Error generating code:", error);
  }
};
  const handleSubmit = async (e) => {
  e.preventDefault();

  if (!assetCode) {
    alert("Please generate an asset code first.");
    return;
  }

  if (!resourceName || !resourceName.trim()) {
    alert("Resource name is required.");
    return;
  }

  try {
    await setDoc(doc(db, "resources", assetCode), {
      assetCode,
      resourceName,
      category,
      type: selectedType,
      description,
      quantity: category === "Facilities" ? null : quantity,
      capacity,
      createdAt: new Date()
    });

    alert("Resource saved successfully");

    closeModal();

  } catch (error) {
    console.error("Error saving resource:", error);
    alert("Failed to save resource.");
  }
};

  return (
    <div className="add-resource-overlay">

      <div className="add-resource-container">

        <div className="add-resource-header">

          <h2>Add Resource</h2>

          <button
            className="close-modal-btn"
            onClick={closeModal}
          >
            <IoCloseOutline size={28} />
          </button>

        </div>

        <form className="add-resource-form" onSubmit={handleSubmit}>

          <ResourceFields
            category={category}
            types={types}
            categories={categories}
            handleCategoryChange={handleCategoryChange}
            handleTypeChange={handleTypeChange}
            generateCode={generateCode}
            assetCode={assetCode}
            selectedType={selectedType}

            resourceName={resourceName}
            setResourceName={setResourceName}
            description={description}
            setDescription={setDescription}
            quantity={quantity}
            setQuantity={setQuantity}
            capacity={capacity}
            setCapacity={setCapacity}
            />

          <button className="submit-resource-btn" type="submit">
            Save Resource
          </button>

        </form>

      </div>

    </div>
  );
}