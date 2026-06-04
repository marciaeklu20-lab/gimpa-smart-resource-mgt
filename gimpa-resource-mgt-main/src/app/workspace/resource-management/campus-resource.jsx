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

import {
  isResourceManager,
  categoriesForRole
} from "@/app/lib/categoryResponsibility";
import { RESOURCE_MANAGERS } from "@/app/lib/roles";

import "@/app/styles/workspace/campus-resource.css";
import "@/app/styles/resource-management/resource-list.css";
import "@/app/styles/resource-management/asset-master-detail.css";

export default function CampusResource({
  userRole,
  initialAssetId
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

  // Stage 4d: we now need the full user (not just role) for the
  // Report-Fault modal's reporter fields. Derive role from this.
  const [currentUser, setCurrentUser] = useState(null);
  const currentUserRole = currentUser?.role || null;

  // Stage 4e.7: anyone whose role can manage a category, plus
  // super_admin, sees the "+ Add Resource" button. Maintenance, global
  // approvers, and reporters do not.
  const allowedRoles = useMemo(
    () => [...RESOURCE_MANAGERS, "super_admin"],
    []
  );

  // Stage 4e.7: responsibility-aware filter tab. "all" passes
  // everything through; "mine" restricts the visible resource set to
  // the categories the current user manages. super_admin's "mine" is
  // a no-op (they manage everything). Toggle is hidden for users who
  // aren't admins or resource managers — they just browse all.
  const isAdminViewer = currentUserRole === "super_admin"
    || currentUserRole === "Secretariat Admin";
  const isManager = currentUserRole && isResourceManager(currentUserRole);
  const showResponsibilityTabs = isAdminViewer || isManager;

  const [responsibilityFilter, setResponsibilityFilter] = useState("all");
  const [responsibilityFilterInitialized, setResponsibilityFilterInitialized]
    = useState(false);

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
          setCurrentUser({ uid: firebaseUser.uid, ...userDoc.data() });
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

  // Stage 4d: deep-link from FaultDetailPanel "open asset" — when the
  // parent passes an initialAssetId, select that asset in the master
  // pane so the detail panel populates immediately on landing.
  useEffect(() => {
    if (initialAssetId) {
      setSelectedAssetId(initialAssetId);
    }
  }, [initialAssetId]);

  // Default tab: resource managers land on "My Responsibility";
  // admins land on "All Resources". Runs once per user load so manual
  // switches stick.
  useEffect(() => {
    if (!currentUserRole || responsibilityFilterInitialized) return;
    if (isManager && !isAdminViewer) {
      setResponsibilityFilter("mine");
    } else {
      setResponsibilityFilter("all");
    }
    setResponsibilityFilterInitialized(true);
  }, [currentUserRole, isManager, isAdminViewer, responsibilityFilterInitialized]);

  // Clear the type filter whenever the category changes — a type
  // selected under category A is meaningless under category B.
  useEffect(() => {
    setSelectedType("");
  }, [selectedCategory]);

  // Responsibility-scoped resource set — applied BEFORE the category-
  // card and search filters so the counts in CategoryCards reflect
  // what the user actually owns under "My Responsibility".
  const responsibilityResources = useMemo(() => {
    if (responsibilityFilter !== "mine") return resources;
    if (!currentUserRole) return [];
    // super_admin (and any future PLATFORM_ADMIN we want to special-
    // case) owns everything under "My Responsibility".
    if (currentUserRole === "super_admin") return resources;
    const owned = new Set(categoriesForRole(currentUserRole));
    if (owned.size === 0) return [];
    return resources.filter((r) => owned.has(r.category));
  }, [resources, responsibilityFilter, currentUserRole]);

  const filteredResources = useMemo(() => {

    const search = searchTerm.toLowerCase();

    return responsibilityResources.filter((resource) => {

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

  }, [responsibilityResources, searchTerm, selectedCategory, selectedType]);

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

      responsibilityResources

        .filter((r) =>
          !selectedCategory
          || r.category === selectedCategory
        )

        .map((r) => r.type)

    )

  ], [responsibilityResources, selectedCategory]);

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

      {showResponsibilityTabs && (
        <div className="responsibility-filter-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={responsibilityFilter === "all"}
            className={`responsibility-filter-tab ${
              responsibilityFilter === "all" ? "active" : ""
            }`}
            onClick={() => setResponsibilityFilter("all")}
          >
            All Resources ({resources.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={responsibilityFilter === "mine"}
            className={`responsibility-filter-tab ${
              responsibilityFilter === "mine" ? "active" : ""
            }`}
            onClick={() => setResponsibilityFilter("mine")}
          >
            My Responsibility (
            {currentUserRole === "super_admin"
              ? resources.length
              : resources.filter((r) =>
                  categoriesForRole(currentUserRole).includes(r.category)
                ).length}
            )
          </button>
        </div>
      )}

      <CampusResourceControls
        allowedRoles={allowedRoles}
        userRole={currentUserRole}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        typesForCategory={typesForCategory}
        setShowModal={setShowModal}
      />

      <CategoryCards
        resources={responsibilityResources}
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
            currentUser={currentUser}
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
