import {
  departmentRoles,
  operationalApprovers,
  globalApprovers
} from "./permissions";

export const getBookingRecipients = ({
  requesterRole,
  requesterDepartment
}) => {

  if (
    departmentRoles.includes(
      requesterRole
    )
  ) {

    return {

      approvalRoute:
        "department",

      targetRoles: [
        "Secretariat Admin",
        ...globalApprovers
      ],

      department:
        requesterDepartment

    };

  }

  return {

    approvalRoute:
      "operations",

    targetRoles: [
      ...operationalApprovers,
      ...globalApprovers
    ],

    department: null

  };

};