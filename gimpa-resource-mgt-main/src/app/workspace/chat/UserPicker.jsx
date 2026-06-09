"use client";

// Stage 5 — modal for starting a new DM. Lists approved users (minus self)
// with a client-side search over name / role / email.
//
// NB: Firestore's users `allow list` rule only grants the directory to
// admin / operational-approver / maintenance / resource-manager roles. For
// other roles this query is permission-denied and the modal shows a clear
// message — they can still receive and reply to DMs, just not initiate one.
// Broadening that is a deliberate (unmade) security decision.

import { useEffect, useMemo, useState } from "react";
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs
} from "firebase/firestore";

import app from "@/firebase/config";

const db = getFirestore(app);

export default function UserPicker({ currentUser, onPick, onClose }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const q = query(collection(db, "users"), where("approved", "==", true));
        const snap = await getDocs(q);
        if (!active) return;
        const list = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() }))
          .filter((u) => u.uid !== currentUser?.uid);
        setUsers(list);
        setLoading(false);
      } catch (err) {
        console.error("[UserPicker] list users:", err);
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUser?.uid]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return users;
    return users.filter(
      (u) =>
        (u.fullName || "").toLowerCase().includes(s) ||
        (u.role || "").toLowerCase().includes(s) ||
        (u.email || "").toLowerCase().includes(s)
    );
  }, [users, search]);

  return (
    <div className="chat-picker-overlay" onClick={onClose}>
      <div className="chat-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="chat-picker-header">
          <h3>Start a direct message</h3>
          <button type="button" className="chat-picker-close" onClick={onClose}>
            ×
          </button>
        </div>

        <input
          className="chat-picker-search"
          type="text"
          placeholder="Search by name, role, or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        <div className="chat-picker-list">
          {loading ? (
            <p className="chat-picker-status">Loading users…</p>
          ) : error ? (
            <p className="chat-picker-status">
              You don’t have permission to browse the user directory.
            </p>
          ) : filtered.length === 0 ? (
            <p className="chat-picker-status">No matching users.</p>
          ) : (
            filtered.map((u) => (
              <div
                key={u.uid}
                className="chat-picker-item"
                onClick={() => onPick(u.uid)}
              >
                <span className="chat-picker-name">{u.fullName || u.email || u.uid}</span>
                <span className="chat-picker-role">{u.role}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
