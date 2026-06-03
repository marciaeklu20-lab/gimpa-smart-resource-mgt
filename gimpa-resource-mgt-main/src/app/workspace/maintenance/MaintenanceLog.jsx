"use client";

import { BsClockHistory } from "react-icons/bs";

export default function MaintenanceLog() {

  return (

    <div className="maintenance-tab-pane">

      <header className="maintenance-header">
        <h1>Maintenance Log</h1>
      </header>

      <div className="maintenance-empty-card">

        <div className="maintenance-empty-icon">
          <BsClockHistory size={56} />
        </div>

        <p className="maintenance-empty-message">
          No log entries yet.
        </p>

        <p className="maintenance-empty-detail">
          Resolved faults and maintenance activity will appear here as
          a chronological audit log.
        </p>

      </div>

    </div>

  );

}
