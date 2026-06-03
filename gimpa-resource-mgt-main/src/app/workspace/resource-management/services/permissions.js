import { GLOBAL_APPROVERS } from "@/app/lib/roles";

export const departmentRoles = [
  "Course Rep",
  "Lecturer",
  "Teaching Assistant"
];

export const cannotBookRoles = [
  "General Student"
];

export const operationalApprovers = [
  "Facility/Estate Officer",
  "Stores/Inventory Officer",
  "Receptionist"
];

// Re-exported under its legacy name for getBookingRecipients.js. The
// shared list excludes super_admin (super_admin sees every booking via
// ALL_BOOKING_ADMINS in subscribeBookings.js, so they don't need to be
// listed as a booking target).
export const globalApprovers = GLOBAL_APPROVERS;

export const canBookResource = (
  role
) => {

  return !cannotBookRoles.includes(
    role
  );

};

export const isDepartmentRole = (
  role
) => {

  return departmentRoles.includes(
    role
  );

};