"use client";

import React, {
  useState,
  useEffect,
  useMemo
} from "react";

import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc
} from "firebase/firestore";

import {
  getAuth
} from "firebase/auth";

import app from "@/firebase/config";

import AddResourceForm from "./add-resource/AddResourceForm";

import CampusResourceControls from "./components/CampusResourceControls";

import ResourceTable from "./components/ResourceTable";

import CategoryCards from "./CategoryCards";

import AssetDetailPanel from "./AssetDetailPanel";

import "@/app/styles/workspace/campus-resource.css";
import "@/app/styles/resource-management/resource-list.css";
import "@/app/styles/resource-management/asset-master-detail.css";

export default function CampusResource({
  userRole
}) {

  const db = getFirestore(app);

  const auth = getAuth(app);

  const [showModal, setShowModal] = useState(false);

  const [resources, setResources] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");

  const [selectedCategory, setSelectedCategory] = useState("");

  const [selectedType, setSelectedType] = useState("");

  // Stage 4b: which row is highlighted in the master table and
  // populating the detail panel on the right.
  const [selectedAssetId, setSelectedAssetId] = useState(null);

  const [currentUserRole, setCurrentUserRole] = useState(null);

  const allowedRoles = [
    "Stores/Inventory Officer",
    "Facility/Estate Officer"
  ];

  const fetchResources = async () => {

    try {

      const snapshot = await getDocs(
        collection(db, "resources")
      );

      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      setResources(data);

    } catch (error) {

      console.error(
        "Error fetching resources:",
        error
      );

    }

  };

  useEffect(() => {

    const loadUserRole = async () => {

      try {

        const firebaseUser = auth.currentUser;

        if (!firebaseUser) return;

        const userDoc = await getDoc(
          doc(db, "users", firebaseUser.uid)
        );

        if (userDoc.exists()) {
          setCurrentUserRole(userDoc.data().role);
        }

      } catch (error) {

        console.error(error);

      }

    };

    loadUserRole();

  }, []);

  useEffect(() => {

    fetchResources();

  }, []);

  // Clear the type filter whenever the category changes — a type
  // selected under category A is meaningless under category B.
  useEffect(() => {
    setSelectedType("");
  }, [selectedCategory]);

  const filteredResources = useMemo(() => {

    const search = searchTerm.toLowerCase();

    return resources.filter((resource) => {

      const matchesSearch =
        resource.assetCode?.toLowerCase().includes(search)
        || resource.resourceName?.toLowerCase().includes(search)
        || resource.category?.toLowerCase().includes(search)
        || resource.type?.toLowerCase().includes(search);

      const matchesCategory =
        !selectedCategory
        || resource.category === selectedCategory;

      const matchesType =
        !selectedType
        || resource.type === selectedType;

      return matchesSearch && matchesCategory && matchesType;

    });

  }, [resources, searchTerm, selectedCategory, selectedType]);

  // If the currently-selected asset gets filtered out (user changes
  // category / search), clear the panel so we're not displaying an
  // asset that isn't in the visible list any more.
  useEffect(() => {
    if (!selectedAssetId) return;
    const stillVisible = filteredResources.some(
      (r) => r.id === selectedAssetId
    );
    if (!stillVisible) {
      setSelectedAssetId(null);
    }
  }, [filteredResources, selectedAssetId]);

  const typesForCategory = useMemo(() => [

    ...new Set(

      resources

        .filter((r) =>
          !selectedCategory
          || r.category === selectedCategory
        )

        .map((r) => r.type)

    )

  ], [resources, selectedCategory]);

  const selectedAsset = selectedAssetId
    ? resources.find((r) => r.id === selectedAssetId) || null
    : null;

  return (

    <div className="campus-resource-container">

      <div className="campus-resource-header">

        <p className="campus-resource-subtitle">
          Manage and view all resources
          available across the institution
        </p>

      </div>

      <CampusResourceControls
        allowedRoles={allowedRoles}
        userRole={userRole}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        typesForCategory={typesForCategory}
        setShowModal={setShowModal}
      />

      <CategoryCards
        resources={resources}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      <div className="master-detail-layout">

        <div className="master-pane">

          <ResourceTable
            filteredResources={filteredResources}
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
          />

        </div>

        <div
          className={`detail-pane ${selectedAsset ? "detail-pane-open" : ""}`}
        >

          <AssetDetailPanel
            selectedAsset={selectedAsset}
            currentUserRole={currentUserRole}
            onClose={() => setSelectedAssetId(null)}
          />

        </div>

      </div>

      {showModal && (

        <AddResourceForm
          closeModal={() => {
            setShowModal(false);
            fetchResources();
          }}
        />

      )}

    </div>

  );

}
