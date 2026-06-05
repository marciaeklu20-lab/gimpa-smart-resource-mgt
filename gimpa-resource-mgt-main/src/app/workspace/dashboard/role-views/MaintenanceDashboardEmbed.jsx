"use client";

// Stage 4g: maintenance roles land on a slim wrapper around the
// existing 6-card MaintenanceDashboard. We reuse the component
// verbatim — duplicating its KPI strip into the role-views tree
// would mean keeping two listeners in sync forever. The wrapper
// only adds a greeting + a one-click route into the Maintenance
// module.

import MaintenanceDashboard from "@/app/workspace/maintenance/MaintenanceDashboard";

export default function MaintenanceDashboardEmbed({ currentUser, navigate }) {

  const firstName = currentUser?.fullName?.split(" ")[0] || "there";

  return (

    <div className="dashboard-container">

      <div className="dashboard-header dashboard-header-with-action">
        <div>
          <h1 className="dashboard-greeting">
            Your maintenance workspace, {firstName}
          </h1>
          <p className="dashboard-subtitle">
            Faults, assignments, and asset condition — live across GIMPA.
          </p>
        </div>
        <button
          type="button"
          className="dashboard-quick-action"
          onClick={() => navigate?.({ sidebar: "Maintenance" })}
        >
          Open Maintenance module →
        </button>
      </div>

      <div className="dashboard-maintenance-embed">
        <MaintenanceDashboard currentUser={currentUser} />
      </div>

    </div>
  );
}
