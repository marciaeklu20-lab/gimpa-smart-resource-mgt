"use client";

import { FaToolbox } from "react-icons/fa";

export default function FaultsList() {

  return (

    <div className="maintenance-tab-pane">

      <header className="maintenance-header">
        <h1>Faults</h1>
      </header>

      <div className="maintenance-empty-card">

        <div className="maintenance-empty-icon">
          <FaToolbox size={56} />
        </div>

        <p className="maintenance-empty-message">
          No faults reported yet.
        </p>

        <p className="maintenance-empty-detail">
          Once users report faults on assets, they'll appear here for
          review and assignment.
        </p>

        <p className="maintenance-empty-hint">
          (Fault reporting will be enabled in the next update.)
        </p>

      </div>

    </div>

  );

}
