"use client";

import "@/app/styles/auth/signup.css";
import { departments } from "@/app/constants/departments";

export default function RoleSelector({
  roleType, // "student" or "staff"
  studentType,
  setStudentType,
  position,
  setPosition,
  department,
  setDepartment
}) {

  const studentRoles = [
    { value: "General Student", label: "General Student" },
    { value: "Course Rep", label: "Course Rep" }
  ];

  const facultyStaffRoles = [
    { value: "Secretariat Admin", label: "Secretariat Admin" },
    { value: "Lecturer", label: "Lecturer" },
    { value: "Teaching Assistant", label: "Teaching Assistant" }
  ];

  const nonFacultyStaffRoles = [
    { value: "Researcher", label: "Researcher" },
    { value: "Research Assistant", label: "Research Assistant" },
    { value: "Registrar", label: "Registrar" },
    { value: "Assistant Registrar", label: "Assistant Registrar" },
    { value: "Administrative Officer", label: "Administrative Officer" },
    { value: "Lab Technician", label: "Lab Technician" },
    { value: "IT Officer", label: "IT Officer" },
    { value: "Librarian", label: "Librarian" },
    { value: "Finance Officer", label: "Finance Officer" },
    { value: "Cleaner", label: "Cleaner" },
    { value: "Security Officer", label: "Security Officer" },
    { value: "Receptionist", label: "Receptionist" },
    { value: "Counselor / Student Affairs Officer", label: "Counselor / Student Affairs Officer" },
    { value: "Maintenance Officer", label: "Maintenance Officer" },
    { value: "Maintenance Admin", label: "Maintenance Admin" },
    { value: "Maintenance Staff", label: "Maintenance Staff" },
    { value: "Stores/Inventory Officer", label: "Stores/Inventory Officer" },
    { value: "Facility/Estate Officer", label: "Facility/Estate Officer" },
    { value: "Procurement Officer", label: "Procurement Officer" },
    { value: "Higher Level Management", label: "Higher Level Management" }
  ];

  const staffRoles = [...facultyStaffRoles, ...nonFacultyStaffRoles];

  // Show department dropdown only for faculty staff or Course Rep students
  const showDepartmentDropdown =
    (roleType === "student" && studentType === "Course Rep") ||
    (roleType === "staff" && facultyStaffRoles.map(r => r.value).includes(position));

  return (
    <div className="role-selector-wrapper">
      {/* Role select */}
      <div className="select-wrapper">
        <select
          value={roleType === "student" ? studentType : position}
          onChange={(e) => {
            if (roleType === "student") {
              setStudentType(e.target.value);
            } else {
              setPosition(e.target.value);
            }
            if (!showDepartmentDropdown) setDepartment("");
          }}
          required
        >
          <option value="">-- Select Role --</option>
          {(roleType === "student" ? studentRoles : staffRoles).map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {/* Department select */}
      {showDepartmentDropdown && (
        <div className="select-wrapper">
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            required
          >
            <option value="">-- Select Department --</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}