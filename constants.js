const UserTypes = {
  user: "User",
  guest: "Guest",
  admin: "Admin",
};

const UserStatus = {
  active: "Active",
  inactive: "Inactive",
};

const Messages = {
  inactiveUser: "Action not allowed: Inactive User",
  invalidToken: "Action not allowed: Invalid Token",
  success: "Action successful",
  serverError: "Internal server error",
};

module.exports = { UserTypes, UserStatus, Messages };
