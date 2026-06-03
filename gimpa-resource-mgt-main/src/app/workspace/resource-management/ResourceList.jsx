"use client";

import {
  useEffect,
  useState
} from "react";

import {
  getFirestore,
  collection,
  getDocs
} from "firebase/firestore";

import "../../../styles/resource-management/resource-list.css";

import app from "@/firebase/config";

import BookingForm from "./BookingForm";

import {
  canBookResource
} from "./services/permissions";

import {
  isBookable,
  lifecycleLabel
} from "@/app/lib/resourceMeta";

export default function ResourceList({
  searchTerm,
  selectedCategory,
  userRole
}) {

  const db = getFirestore(app);

  const [resources, setResources] =
    useState([]);

  const [
    filteredResources,
    setFilteredResources
  ] = useState([]);

  const [
    selectedResource,
    setSelectedResource
  ] = useState(null);

  useEffect(() => {

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

        setFilteredResources(data);

      } catch (error) {

        console.error(
          "Error fetching resources:",
          error
        );

      }

    };

    fetchResources();

  }, []);

  useEffect(() => {

    let filtered = resources;

    if (selectedCategory) {

      filtered = filtered.filter(
        (r) =>
          r.category ===
          selectedCategory
      );

    }

    if (searchTerm) {

      const search =
        searchTerm.toLowerCase();

      filtered = filtered.filter(
        (r) =>

          r.resourceName
            ?.toLowerCase()
            .includes(search)

          ||

          r.assetCode
            ?.toLowerCase()
            .includes(search)

          ||

          r.type
            ?.toLowerCase()
            .includes(search)

          ||

          r.category
            ?.toLowerCase()
            .includes(search)

      );

    }

    setFilteredResources(filtered);

  }, [
    searchTerm,
    selectedCategory,
    resources
  ]);

  return (

    <>

      <div className="resource-section">

        <div className="resource-table-wrapper">

          <table className="resource-table">

            <thead>

              <tr>

                <th>Asset Code</th>

                <th>Resource Name</th>

                <th>Category</th>

                <th>Type</th>

                <th>Quantity</th>

                <th>Capacity</th>

                <th>Booking</th>

              </tr>

            </thead>

            <tbody>

              {filteredResources.length === 0 ? (

                <tr>

                  <td
                    colSpan="7"
                    className="no-resources"
                  >
                    No resources found
                  </td>

                </tr>

              ) : (

                filteredResources.map(
                  (resource) => (

                  <tr key={resource.id}>

                    <td>
                      {resource.assetCode}
                    </td>

                    <td className="resource-name">
                      {resource.resourceName}
                    </td>

                    <td>
                      {resource.category}
                    </td>

                    <td>
                      {resource.type}
                    </td>

                    <td>
                      {resource.quantity || "-"}
                    </td>

                    <td>
                      {resource.capacity || "-"}
                    </td>

                    <td>

                      {canBookResource(userRole) && (
                        isBookable(resource) ? (
                          <button
                            className="book-resource-btn"
                            onClick={() => setSelectedResource(resource)}
                          >
                            Book Resource
                          </button>
                        ) : (
                          <span
                            className="resource-status-unavailable"
                            title={`Status: ${lifecycleLabel(resource.lifecycleStatus)}`}
                          >
                            {lifecycleLabel(resource.lifecycleStatus)}
                          </span>
                        )
                      )}

                    </td>

                  </tr>

                ))

              )}

            </tbody>

          </table>

        </div>

      </div>

      {selectedResource && (

        <BookingForm

          resource={selectedResource}

          closeModal={() =>
            setSelectedResource(null)
          }

        />

      )}

    </>

  );

}