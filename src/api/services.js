// Every API service the admin portal calls, by service ID — like the website's list. The API's
// architecture tests check every ID here, and every api.call("…") in the portal, exists on the
// server. client.js refuses an ID that isn't listed.
//
// Everything ADMIN_* except the sign-in and ADMIN_ME is admin-only: it works only from a portal
// session (code + password), and only for roles ticked for it.

export const SERVICES = [
  // Signing in: the emailed code is the website's own; the password step is the portal's.
  "AUTH_OTP_SEND",
  "ADMIN_AUTH_SIGN_IN",
  "AUTH_LOGOUT",
  "ADMIN_ME",

  // Every tournament, paged — query: view ("Live" | "Upcoming" | "Past"), search, page, pageSize
  "ADMIN_TOURNAMENT_LIST",
  "ADMIN_TOURNAMENT_REOPEN", // id

  // People — query: search, roleId, page, pageSize
  "ADMIN_USER_LIST",
  "ADMIN_USER_SET_BLOCKED", // userId
  "ADMIN_USER_SET_ROLE", // userId
  "ADMIN_USER_SIGN_OUT", // userId
  "ADMIN_USER_RESET_PASSWORD", // userId

  // Roles and the role editor
  "ADMIN_ROLE_LIST",
  "ADMIN_ROLE_CREATE",
  "ADMIN_ROLE_UPDATE", // roleId
  "ADMIN_ROLE_DELETE", // roleId
  "ADMIN_ROLE_PERMISSIONS", // roleId
  "ADMIN_ROLE_PERMISSIONS_SAVE", // roleId

  // Permissions
  "ADMIN_PERMISSION_LIST",
  "ADMIN_PERMISSION_SYNC",
  "ADMIN_PERMISSION_SET_DISABLED", // permissionId
];
