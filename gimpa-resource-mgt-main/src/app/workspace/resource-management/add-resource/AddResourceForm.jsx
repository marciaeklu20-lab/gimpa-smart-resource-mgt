"use client";

import { useEffect, useState } from "react";
import ResourceFields from "./ResourceFields";
import { IoCloseOutline } from "react-icons/io5";
import "@/app/styles/workspace/add-resource.css";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import app from "@/firebase/config";

import {
  DEFAULT_LIFECYCLE_STATUS,
  DEFAULT_CONDITION
} from "@/app/lib/resourceMeta";

export default function AddResourceForm({ closeModal }) {

  const db = getFirestore(app);
  const auth = getAuth(app);

  // Existing fields
  const [category, setCategory] = useState("");
  const [types, setTypes] = useState([]);
  const [assetCode, setAssetCode] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [capacity, setCapacity] = useState("");

  // Stage 4a: new asset-management fields. Defaults match the form
  // of a freshly-acquired, active asset; the operator only needs to
  // change them if reality differs.
  const [lifecycleStatus, setLifecycleStatus] = useState(DEFAULT_LIFECYCLE_STATUS);
  const [condition, setCondition] = useState(DEFAULT_CONDITION);
  const [locationCampus, setLocationCampus] = useState("");
  const [locationBuilding, setLocationBuilding] = useState("");
  const [locationFloor, setLocationFloor] = useState("");
  const [locationRoom, setLocationRoom] = useState("");
  const [custodianId, setCustodianId] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [warrantyExpiry, setWarrantyExpiry] = useState("");
  const [vendor, setVendor] = useState("");

  // Current user (for the changedBy on initial history entries) +
  // staff list (for the custodian picker). Both load once on mount.
  const [currentUser, setCurrentUser] = useState(null);
  const [staffOptions, setStaffOptions] = useState([]);

  useEffect(() => {
    const loadCurrentUser = async () => {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) return;
      const snap = await getDoc(doc(db, "users", firebaseUser.uid));
      if (snap.exists()) {
        setCurrentUser({ uid: firebaseUser.uid, ...snap.data() });
      }
    };
    loadCurrentUser();
  }, []);

  useEffect(() => {
    const loadStaff = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "users"),
            where("approved", "==", true)
          )
        );
        // Custodianship only makes sense for staff (anyone whose
        // institutional email is @gimpa.edu.gh). Students are
        // excluded so the picker isn't cluttered.
        const staff = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .filter((u) => typeof u.email === "string" && u.email.endsWith("@gimpa.edu.gh"))
          .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
        setStaffOptions(staff);
      } catch (error) {
        console.error("Failed to load staff for custodian picker:", error);
      }
    };
    loadStaff();
  }, []);

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

  // Build the location object only when at least one part is filled
  // in. Saving an empty {campus:"",building:"",...} would clutter the
  // doc with noise.
  const buildLocation = () => {
    const parts = {
      campus: locationCampus.trim(),
      building: locationBuilding.trim(),
      floor: locationFloor.trim(),
      room: locationRoom.trim()
    };
    if (!parts.campus && !parts.building && !parts.floor && !parts.room) {
      return null;
    }
    return parts;
  };

  const toDateOrNull = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
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
    const custodian = custodianId
      ? staffOptions.find((s) => s.uid === custodianId) || null
      : null;

    const acquisitionDateObj = toDateOrNull(acquisitionDate);
    const warrantyExpiryObj = toDateOrNull(warrantyExpiry);
    const costNumber =
      acquisitionCost === "" || acquisitionCost === null
        ? null
        : Number(acquisitionCost);

    await setDoc(doc(db, "resources", assetCode), {
      assetCode,
      resourceName,
      category,
      type: selectedType,
      description,
      quantity: category === "Facilities" ? null : quantity,
      capacity,

      // Stage 4a asset-management fields.
      lifecycleStatus,
      condition,
      location: buildLocation(),
      custodianId: custodian?.uid || null,
      custodianName: custodian?.fullName || null,
      custodianAssignedAt: custodian ? serverTimestamp() : null,
      acquisitionDate: acquisitionDateObj,
      acquisitionCost: Number.isFinite(costNumber) ? costNumber : null,
      warrantyExpiry: warrantyExpiryObj,
      vendor: vendor.trim() || null,

      createdAt: new Date()
    });

    // Initial history entries. Provenance for every asset starts at
    // creation — without these, future history views would show a
    // gap for "where did this asset come from?".
    const actor = currentUser
      ? {
          uid: currentUser.uid,
          name: currentUser.fullName || currentUser.email || "Unknown",
          role: currentUser.role || "unknown"
        }
      : { uid: "unknown", name: "Unknown", role: "unknown" };

    await addDoc(
      collection(db, "resources", assetCode, "conditionHistory"),
      {
        changedAt: serverTimestamp(),
        oldCondition: null,
        newCondition: condition,
        reason: "Initial registration",
        changedBy: actor
      }
    );

    await addDoc(
      collection(db, "resources", assetCode, "lifecycleHistory"),
      {
        changedAt: serverTimestamp(),
        oldStatus: null,
        newStatus: lifecycleStatus,
        reason: "Initial registration",
        changedBy: actor
      }
    );

    if (custodian) {
      await addDoc(
        collection(db, "resources", assetCode, "custodianHistory"),
        {
          changedAt: serverTimestamp(),
          oldCustodianId: null,
          newCustodianId: custodian.uid,
          reason: "Initial assignment",
          changedBy: actor
        }
      );
    }

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

            lifecycleStatus={lifecycleStatus}
            setLifecycleStatus={setLifecycleStatus}
            condition={condition}
            setCondition={setCondition}
            locationCampus={locationCampus}
            setLocationCampus={setLocationCampus}
            locationBuilding={locationBuilding}
            setLocationBuilding={setLocationBuilding}
            locationFloor={locationFloor}
            setLocationFloor={setLocationFloor}
            locationRoom={locationRoom}
            setLocationRoom={setLocationRoom}
            custodianId={custodianId}
            setCustodianId={setCustodianId}
            staffOptions={staffOptions}
            acquisitionDate={acquisitionDate}
            setAcquisitionDate={setAcquisitionDate}
            acquisitionCost={acquisitionCost}
            setAcquisitionCost={setAcquisitionCost}
            warrantyExpiry={warrantyExpiry}
            setWarrantyExpiry={setWarrantyExpiry}
            vendor={vendor}
            setVendor={setVendor}
            />

          <button className="submit-resource-btn" type="submit">
            Save Resource
          </button>

        </form>

      </div>

    </div>
  );
}
