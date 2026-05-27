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

export const globalApprovers = [
  "Administrative Officer",
  "Higher Level Management",
  "super_admin"
];

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