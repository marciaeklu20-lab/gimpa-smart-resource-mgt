"use client";

import { useEffect, useMemo, useState } from "react";

import dynamic from "next/dynamic";

import { getAuth } from "firebase/auth";

import {
  getFirestore,
  doc,
  getDoc
} from "firebase/firestore";

import app from "@/firebase/config";

import { FaBoxOpen } from "react-icons/fa";

import { subscribeSupplyRequests } from "../services/supplyRequest/subscribeSupplyRequests";

import SupplyRequestDetailPanel from "./SupplyRequestDetailPanel";

import { relativeTime } from "@/app/lib/resourceMeta";
import { MAINTENANCE_ROLES, PLATFORM_ADMINS } from "@/app/lib/roles";

import "@/app/styles/workspace/supply-requests.css";

const SupplyRequestModal = dynamic(
  () => import("./SupplyRequestModal"),
  { ssr: false }
);

const STATUS_LABEL = {
  pending:   "Pending",
  approved:  "Approved",
  denied:    "Denied",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled"
};

export default function SupplyRequestsList({ navigate }) {

  const db = getFirestore(app);
  const auth = getAuth(app);

  const [currentUser, setCurrentUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Filter tab: "all" / "pending" / "mine". Default differs by role.
  const [filter, setFilter] = useState("all");
  const [filterInitialized, setFilterInitialized] = useState(false);

  useEffect(() => {
    const load = async () => {
      const fu = auth.currentUser;
      if (!fu) return;
      const snap = await getDoc(doc(db, "users", fu.uid));
      if (snap.exists()) {
        setCurrentUser({ uid: fu.uid, ...snap.data() });
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeSupplyRequests({
      user: currentUser,
      onUpdate: setRequests
    });
    return () => unsub();
  }, [currentUser?.uid, currentUser?.role]);

  // Default filter — Stores lands on pending (their queue), maintenance
  // technicians on their own requests, admins on all.
  useEffect(() => {
    if (!currentUser || filterInitialized) return;
    const role = currentUser.role;
    const isStores = role === "Stores/Inventory Officer";
    const isMaintenanceTech = role === "Maintenance Staff";
    if (isStores) {
      setFilter("pending");
    } else if (isMaintenanceTech) {
      setFilter("mine");
    } else {
      setFilter("all");
    }
    setFilterInitialized(true);
  }, [currentUser?.uid, currentUser?.role, filterInitialized]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const canRequest = useMemo(() => {
    if (!currentUser) return false;
    return MAINTENANCE_ROLES.includes(currentUser.role)
      || PLATFORM_ADMINS.includes(currentUser.role);
  }, [currentUser?.role]);

  const visibleRequests = useMemo(() => {
    if (filter === "pending") {
      return requests.filter((r) => r.status === "pending");
    }
    if (filter === "mine") {
      if (!currentUser?.uid) return [];
      return requests.filter((r) => r.requesterId === currentUser.uid);
    }
    return requests;
  }, [requests, filter, currentUser?.uid]);

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  const myCount = useMemo(() => {
    if (!currentUser?.uid) return 0;
    return requests.filter((r) => r.requesterId === currentUser.uid).length;
  }, [requests, currentUser?.uid]);

  // Clear stale selection if filtered out.
  useEffect(() => {
    if (!selectedId) return;
    const stillVisible = visibleRequests.some((r) => r.id === selectedId);
    if (!stillVisible) setSelectedId(null);
  }, [visibleRequests, selectedId]);

  const selectedRequest = useMemo(
    () => (selectedId
      ? visibleRequests.find((r) => r.id === selectedId) || null
      : null),
    [visibleRequests, selectedId]
  );

  const isEmpty = visibleRequests.length === 0;

  return (
    <div className="maintenance-tab-pane">

      <header className="maintenance-header">
        <h1>Supply Requests</h1>
      </header>

      <div className="faults-toolbar">
        <div className="faults-filter-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "all"}
            className={`faults-filter-tab ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({requests.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "pending"}
            className={`faults-filter-tab ${filter === "pending" ? "active" : ""}`}
            onClick={() => setFilter("pending")}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "mine"}
            className={`faults-filter-tab ${filter === "mine" ? "active" : ""}`}
            onClick={() => setFilter("mine")}
          >
            My Requests ({myCount})
          </button>
        </div>
        <div style={{ flex: 1 }} />
        {canRequest && (
          <button
            type="button"
            className="faults-report-btn"
            onClick={() => setShowModal(true)}
          >
            + Request Supplies
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="faults-empty-card">
          <div style={{ marginBottom: 14, color: "#94a3b8" }}>
            <FaBoxOpen size={48} />
          </div>
          <h3>
            {filter === "pending"
              ? "No pending supply requests."
              : filter === "mine"
                ? "You haven't submitted any supply requests yet."
                : "No supply requests yet."}
          </h3>
          <p>
            {filter === "pending"
              ? "When maintenance staff need supplies, requests will queue here."
              : filter === "mine"
                ? "When you ask Stores for tools or consumables, your requests appear here."
                : "Maintenance staff request tools and consumables from Stores. They'll show up here."}
          </p>
          {canRequest && (
            <button
              type="button"
              className="faults-report-btn"
              onClick={() => setShowModal(true)}
            >
              + Request Supplies
            </button>
          )}
        </div>
      ) : (
        <div className="faults-master-detail">
          <div className="faults-master-pane">
            <div className="faults-table-container">
              <table className="faults-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Items</th>
                    <th>Requester</th>
                    <th>Linked fault</th>
                    <th>Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRequests.map((r) => {
                    const isSelected = selectedId === r.id;
                    const itemCount = Array.isArray(r.items) ? r.items.length : 0;
                    const previewName = r.items?.[0]?.resourceName || "—";
                    const extra = itemCount > 1 ? ` + ${itemCount - 1} more` : "";
                    return (
                      <tr
                        key={r.id}
                        className={`fault-row ${isSelected ? "fault-row-selected" : ""}`}
                        onClick={() => setSelectedId(r.id)}
                      >
                        <td>
                          <span className={`fault-pill supply-status-${r.status || "pending"}`}>
                            {STATUS_LABEL[r.status] || r.status}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: "#003366" }}>{previewName}</strong>
                          <div style={{ color: "#64748b", fontSize: "0.78rem", fontWeight: 600 }}>
                            {itemCount} item{itemCount === 1 ? "" : "s"}{extra}
                          </div>
                        </td>
                        <td>{r.requesterName || "—"}</td>
                        <td>
                          {r.relatedFaultId ? (
                            <span title={r.relatedResourceName || ""}>
                              {r.relatedResourceName || "Linked fault"}
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>—</span>
                          )}
                        </td>
                        <td>{r.createdAt ? relativeTime(r.createdAt, now) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div
            className={`faults-detail-pane ${selectedRequest ? "faults-detail-pane-open" : ""}`}
          >
            <SupplyRequestDetailPanel
              selectedRequest={selectedRequest}
              currentUser={currentUser}
              navigate={navigate}
              onClose={() => setSelectedId(null)}
            />
          </div>
        </div>
      )}

      {showModal && (
        <SupplyRequestModal
          closeModal={() => setShowModal(false)}
          lockedFault={null}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
