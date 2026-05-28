"use client";

import { useEffect, useState } from "react";
import {
  getFirestore,
  collection,
  getDocs
} from "firebase/firestore";
import app from "@/firebase/config";

import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

import {
  bookingsByResource,
  bookingsByDepartment,
  bookingsByStatus,
  bookingsByDayOfWeek,
  kpiSummary
} from "./aggregations";

import "@/app/styles/analytics/Analytics.css";

const STATUS_COLORS = {
  pending: "#f5a623",
  approved: "#2ecc71",
  rejected: "#e74c3c",
  unknown: "#95a5a6"
};

const PIE_PALETTE = [
  "#4a6cf7", "#2ecc71", "#f5a623", "#e74c3c",
  "#9b59b6", "#1abc9c", "#34495e", "#e67e22"
];

const KpiCard = ({ label, value, tone }) => (
  <div className={`analytics-kpi-card ${tone ? `tone-${tone}` : ""}`}>
    <div className="analytics-kpi-value">{value}</div>
    <div className="analytics-kpi-label">{label}</div>
  </div>
);

export default function Analytics() {

  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = getFirestore(app);
        const snapshot = await getDocs(collection(db, "bookings"));
        if (cancelled) return;
        setBookings(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        if (cancelled) return;
        // The most common cause is Firestore rules: only admins / global
        // approvers can read the full bookings collection.
        setError(e.message || "Failed to load bookings");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="analytics-container">
        <div className="analytics-error">
          Could not load analytics: {error}
        </div>
      </div>
    );
  }

  if (bookings === null) {
    return (
      <div className="analytics-container">
        <div className="analytics-loading">Loading analytics…</div>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="analytics-container">
        <div className="analytics-empty">
          No bookings yet. Once users start booking resources — or you run the
          seed script (<code>scripts/seedBookings.js</code>) — the charts will
          populate here.
        </div>
      </div>
    );
  }

  const kpi = kpiSummary(bookings);
  const perResource = bookingsByResource(bookings);
  const perDepartment = bookingsByDepartment(bookings);
  const perStatus = bookingsByStatus(bookings);
  const perDay = bookingsByDayOfWeek(bookings);

  return (
    <div className="analytics-container">

      <h2 className="analytics-title">Analytics</h2>

      <div className="analytics-kpi-row">
        <KpiCard label="Total bookings" value={kpi.total} />
        <KpiCard label="Pending" value={kpi.pending} tone="pending" />
        <KpiCard label="Approved" value={kpi.approved} tone="approved" />
        <KpiCard label="Rejected" value={kpi.rejected} tone="rejected" />
        <KpiCard label="Unique resources" value={kpi.uniqueResources} />
        <KpiCard label="Unique requesters" value={kpi.uniqueRequesters} />
      </div>

      <div className="analytics-grid">

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Bookings per resource</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={perResource} margin={{ top: 10, right: 20, left: 0, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} height={60} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Bookings" fill="#4a6cf7" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Bookings per department</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={perDepartment} margin={{ top: 10, right: 20, left: 0, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} height={60} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Bookings" fill="#1abc9c" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Bookings by status</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={perStatus}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {perStatus.map((entry, idx) => (
                  <Cell
                    key={entry.name}
                    fill={STATUS_COLORS[entry.name] || PIE_PALETTE[idx % PIE_PALETTE.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="analytics-chart-card">
          <h3 className="analytics-chart-title">Bookings by day of week</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={perDay} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" name="Bookings" fill="#9b59b6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>

    </div>
  );
}
