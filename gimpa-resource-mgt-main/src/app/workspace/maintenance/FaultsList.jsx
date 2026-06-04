"use client";

import { useEffect, useMemo, useState } from "react";

import { getAuth } from "firebase/auth";

import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs
} from "firebase/firestore";

import app from "@/firebase/config";

import { FaToolbox } from "react-icons/fa";

import { subscribeFaults } from "./services/subscribeFaults";

import ReportFaultModal from "./ReportFaultModal";
import FaultDetailPanel from "./FaultDetailPanel";

import { relativeTime } from "@/app/lib/resourceMeta";

import "@/app/styles/workspace/faults.css";

const SEVERITY_LABEL = {
  cosmetic: "Cosmetic",
  minor:    "Minor",
  major:    "Major",
  critical: "Critical"
};

const STATUS_LABEL = {
  pending:      "Pending",
  acknowledged: "Acknowledged",
  in_progress:  "In Progress",
  resolved:     "Resolved",
  closed:       "Closed"
};

export default function FaultsList({ navigate }) {

  const db = getFirestore(app);
  const auth = getAuth(app);

  const [currentUser, setCurrentUser] = useState(null);
  const [faults, setFaults] = useState([]);
  const [selectedFaultId, setSelectedFaultId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [allResources, setAllResources] = useState([]);
  const [now, setNow] = useState(() => Date.now());

  // Load the current user once (for ReportFaultModal's reporter
  // fields). Loaded here rather than passed via prop so FaultsList
  // stays self-contained at the cost of a single user-doc read.
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

  // Faults subscription.
  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeFaults({
      user: currentUser,
      onUpdate: setFaults
    });
    return () => unsub();
  }, [currentUser?.uid, currentUser?.role]);

  // Resource list (for the modal's asset dropdown when no
  // lockedResource is passed). One-shot getDocs since the modal is
  // opened ad-hoc and doesn't need live updates.
  useEffect(() => {
    const loadResources = async () => {
      try {
        const snap = await getDocs(collection(db, "resources"));
        setAllResources(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Failed to load resources for fault report:", e);
      }
    };
    loadResources();
  }, []);

  // Relative-time tick for the master table.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // If the selected fault gets removed from the visible list (e.g.
  // resolved and filtered out later), clear the panel so we're not
  // showing stale data.
  useEffect(() => {
    if (!selectedFaultId) return;
    const stillVisible = faults.some((f) => f.id === selectedFaultId);
    if (!stillVisible) setSelectedFaultId(null);
  }, [faults, selectedFaultId]);

  const selectedFault = useMemo(
    () => (selectedFaultId
      ? faults.find((f) => f.id === selectedFaultId) || null
      : null),
    [faults, selectedFaultId]
  );

  const isEmpty = faults.length === 0;

  return (

    <div className="maintenance-tab-pane">

      <header className="maintenance-header">
        <h1>Faults</h1>
      </header>

      <div className="faults-toolbar">
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="faults-report-btn"
          onClick={() => setShowModal(true)}
        >
          + Report Fault
        </button>
      </div>

      {isEmpty ? (

        <div className="faults-empty-card">
          <div style={{ marginBottom: 14, color: "#94a3b8" }}>
            <FaToolbox size={48} />
          </div>
          <h3>No faults reported yet.</h3>
          <p>
            Once users report faults on assets, they'll appear here
            for review and assignment.
          </p>
          <button
            type="button"
            className="faults-report-btn"
            onClick={() => setShowModal(true)}
          >
            + Report Fault
          </button>
        </div>

      ) : (

        <div className="faults-master-detail">

          <div className="faults-master-pane">

            <div className="faults-table-container">

              <table className="faults-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Resource</th>
                    <th>Description</th>
                    <th>Reporter</th>
                    <th>Status</th>
                    <th>Reported</th>
                  </tr>
                </thead>
                <tbody>
                  {faults.map((f) => {
                    const isSelected = selectedFaultId === f.id;
                    return (
                      <tr
                        key={f.id}
                        className={`fault-row ${isSelected ? "fault-row-selected" : ""}`}
                        onClick={() => setSelectedFaultId(f.id)}
                      >
                        <td>
                          <span className={`fault-pill fault-severity-${f.severity || "minor"}`}>
                            {SEVERITY_LABEL[f.severity] || f.severity}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: "#003366" }}>
                            {f.resourceName}
                          </strong>
                          <div style={{ color: "#64748b", fontSize: "0.78rem", fontWeight: 600 }}>
                            {f.resourceId}
                          </div>
                        </td>
                        <td>
                          <div className="fault-row-description">
                            {f.description}
                          </div>
                        </td>
                        <td>{f.reporterName || "—"}</td>
                        <td>
                          <span className={`fault-pill fault-status-${f.status || "pending"}`}>
                            {STATUS_LABEL[f.status] || f.status}
                          </span>
                        </td>
                        <td>
                          {f.createdAt ? relativeTime(f.createdAt, now) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

            </div>

          </div>

          <div
            className={`faults-detail-pane ${selectedFault ? "faults-detail-pane-open" : ""}`}
          >
            <FaultDetailPanel
              selectedFault={selectedFault}
              currentUser={currentUser}
              navigate={navigate}
              onClose={() => setSelectedFaultId(null)}
            />
          </div>

        </div>

      )}

      {showModal && (
        <ReportFaultModal
          closeModal={() => setShowModal(false)}
          lockedResource={null}
          allResources={allResources}
          currentUser={currentUser}
        />
      )}

    </div>

  );
}
