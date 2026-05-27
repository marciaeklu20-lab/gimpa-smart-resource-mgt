"use client";

import React, {
  useState,
  useEffect
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

import BookingForm from "./BookingForm";

import CampusResourceControls from "./components/CampusResourceControls";

import ResourceTable from "./components/ResourceTable";

import "@/app/styles/workspace/campus-resource.css";

export default function CampusResource({
  userRole
}) {

  const db = getFirestore(app);

  const auth = getAuth(app);

  const [showModal, setShowModal] =
    useState(false);

  const [resources, setResources] =
    useState([]);

  const [searchTerm, setSearchTerm] =
    useState("");

  const [selectedCategory, setSelectedCategory] =
    useState("");

  const [selectedType, setSelectedType] =
    useState("");

  const [selectedResource, setSelectedResource] =
    useState(null);

  const [currentUserRole, setCurrentUserRole] =
    useState(null);

  const allowedRoles = [
    "Stores/Inventory Officer",
    "Facility/Estate Officer"
  ];

  const categories = [
    "Facilities",
    "Electronics & Electrical Equipment",
    "Furniture",
    "Vehicles & Transport",
    "Office Supplies & Stationery",
    "Tools & Maintenance Equipment",
    "Other"
  ];

  const fetchResources = async () => {

    try {

      const snapshot = await getDocs(
        collection(db, "resources")
      );

      const data = snapshot.docs.map(
        (doc) => ({
          id: doc.id,
          ...doc.data()
        })
      );

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

        const firebaseUser =
          auth.currentUser;

        if (!firebaseUser) {
          return;
        }

        const userDoc = await getDoc(
          doc(
            db,
            "users",
            firebaseUser.uid
          )
        );

        if (userDoc.exists()) {

          setCurrentUserRole(
            userDoc.data().role
          );

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

  const filteredResources =
    resources.filter((resource) => {

      const search =
        searchTerm.toLowerCase();

      const matchesSearch =

        resource.assetCode
          ?.toLowerCase()
          .includes(search)

        ||

        resource.resourceName
          ?.toLowerCase()
          .includes(search)

        ||

        resource.category
          ?.toLowerCase()
          .includes(search)

        ||

        resource.type
          ?.toLowerCase()
          .includes(search);

      const matchesCategory =

        !selectedCategory ||

        resource.category ===
          selectedCategory;

      const matchesType =

        !selectedType ||

        resource.type ===
          selectedType;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesType
      );

    });

  const typesForCategory = [

    ...new Set(

      resources

        .filter(

          (r) =>

            !selectedCategory ||

            r.category ===
              selectedCategory

        )

        .map((r) => r.type)

    )

  ];

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
        categories={categories}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        typesForCategory={typesForCategory}
        setShowModal={setShowModal}
      />

      <ResourceTable
        filteredResources={filteredResources}
        currentUserRole={currentUserRole}
        setSelectedResource={setSelectedResource}
      />

      {showModal && (

        <AddResourceForm

          closeModal={() => {

            setShowModal(false);

            fetchResources();

          }}

        />

      )}

      {selectedResource && (

        <BookingForm

          resource={selectedResource}

          closeModal={() =>
            setSelectedResource(null)
          }

        />

      )}

    </div>

  );

}