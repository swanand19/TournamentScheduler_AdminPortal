// The portal session: the token the server gave at the portal sign-in (code + password), its
// (non-secret) id, and who it is. Separate from the website's own session key.
//
// Kept in localStorage so a reload doesn't sign you out. Any script on the page could read it —
// which is why the server keeps portal sessions short (12 hours, sliding), and why the portal
// loads no third-party scripts. The token only ever leaves the browser sealed inside a gateway
// request (gateway.js), never in a header.
//
// Components read it through useSession() in AuthGate.jsx; client.js clears it when the server
// answers 401, which sends the site back to the sign-in screen with the server's reason.

const KEY = "tournamentScheduler.adminSession";

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return saved && typeof saved.token === "string" ? saved : null;
  } catch {
    return null;
  }
}

let current = load();
let signedOutReason = "";
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

/** { token, sessionId, expiresAt, user: { userId, name, email, roleName } } or null. */
export function getSession() {
  return current;
}

/** Why the last session ended, when the server ended it (shown on the sign-in screen). */
export function getSignedOutReason() {
  return signedOutReason;
}

export function setSession(session) {
  current = session;
  signedOutReason = "";
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage blocked: signed in until the page reloads.
  }
  emit();
}

/** Updates who is signed in (after a name change) without touching the token. */
export function updateSessionUser(user) {
  if (!current) return;
  setSession({ ...current, user: { ...current.user, ...user } });
}

export function clearSession(reason = "") {
  current = null;
  signedOutReason = reason;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored to remove.
  }
  emit();
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Signing out in another tab signs this one out too.
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  current = load();
  emit();
});
