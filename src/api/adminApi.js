import { api } from "./client";

// The portal's calls. Every one goes through the secure gateway (client.js); lists come back as
// { items, total, page, pageSize }.

/** Emails a sign-in code (the same one the apps use). */
export const sendCode = (email) => api.call("AUTH_OTP_SEND", { body: { email } });

/**
 * The code, then the password: { outcome: "SignedIn", sessionToken, sessionId, expiresAt, me },
 * or "NeedsPassword" / "NeedsNewPassword" — ask for it and send the same code again with it.
 */
export const signIn = (email, otp, { password, newPassword } = {}) =>
  api.call("ADMIN_AUTH_SIGN_IN", { body: { email, otp, password: password || null, newPassword: newPassword || null } });

export const signOut = () => api.call("AUTH_LOGOUT");
export const getMe = () => api.call("ADMIN_ME");

export const getTournaments = ({ view, search, page, pageSize }) =>
  api.call("ADMIN_TOURNAMENT_LIST", { query: { view, search: search || undefined, page, pageSize } });
export const reopenTournament = (id, endDate) =>
  api.call("ADMIN_TOURNAMENT_REOPEN", { routeParams: { id }, body: { endDate: endDate || null } });

export const getUsers = ({ search, roleId, page, pageSize }) =>
  api.call("ADMIN_USER_LIST", { query: { search: search || undefined, roleId: roleId || undefined, page, pageSize } });
export const setUserBlocked = (userId, blocked) => api.call("ADMIN_USER_SET_BLOCKED", { routeParams: { userId }, body: { blocked } });
export const setUserRole = (userId, roleId) => api.call("ADMIN_USER_SET_ROLE", { routeParams: { userId }, body: { roleId } });
export const signUserOut = (userId) => api.call("ADMIN_USER_SIGN_OUT", { routeParams: { userId }, body: {} });
export const resetUserPassword = (userId) => api.call("ADMIN_USER_RESET_PASSWORD", { routeParams: { userId }, body: {} });

export const getRoles = () => api.call("ADMIN_ROLE_LIST");
export const createRole = (name, description) => api.call("ADMIN_ROLE_CREATE", { body: { name, description } });
export const updateRole = (roleId, name, description) => api.call("ADMIN_ROLE_UPDATE", { routeParams: { roleId }, body: { name, description } });
export const deleteRole = (roleId) => api.call("ADMIN_ROLE_DELETE", { routeParams: { roleId } });
export const getRolePermissions = (roleId) => api.call("ADMIN_ROLE_PERMISSIONS", { routeParams: { roleId } });
/** Saves the whole set: these ticked, every other changeable one not. */
export const saveRolePermissions = (roleId, permissionIds) =>
  api.call("ADMIN_ROLE_PERMISSIONS_SAVE", { routeParams: { roleId }, body: { permissionIds } });

export const getPermissions = () => api.call("ADMIN_PERMISSION_LIST");
export const syncPermissions = () => api.call("ADMIN_PERMISSION_SYNC", { body: {} });
export const setPermissionDisabled = (permissionId, disabled) =>
  api.call("ADMIN_PERMISSION_SET_DISABLED", { routeParams: { permissionId }, body: { disabled } });
