// What a failed request says to the person using the app.
//
// The API explains its own rules in status.message of its { status, data } envelope ("Minutes per
// half must be at least 1."), and those pass straight through: they already say what to fix. What
// gets translated is everything that doesn't: a bare status code, an older server's plain-text or
// problem-details body, an HTML error page, or fetch failing because the API isn't reachable at all.

function serverMessage(text) {
  const t = (text || "").trim();
  if (!t) return "";
  if (t.startsWith("<")) return ""; // an HTML error page
  if (t.startsWith("{")) {
    try {
      const body = JSON.parse(t);
      if (typeof body.status?.message === "string") return body.status.message;
      const firstFieldError = body.errors && Object.values(body.errors).flat()[0];
      return String(firstFieldError || body.detail || body.message || body.title || "");
    } catch {
      return t;
    }
  }
  return t;
}

function messageFor(status, text) {
  const server = serverMessage(text);
  if (status >= 500) {
    // Keep a short, deliberate message; hide stack traces and exception dumps.
    const readable = server && server.length < 200 && !server.includes("\n");
    return readable ? server : "The server ran into a problem. Wait a moment and try again.";
  }
  if (status === 404) return server || "That item no longer exists. Go back and reload the list.";
  if (status === 409) return server || "Something changed since this screen loaded. Reload it and try again.";
  return server || `The request was refused (error ${status}). Reload the page and try again.`;
}

/** An error the API answered with. Keeps the status for code that needs to tell cases apart. */
export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * The error for a failed answer. `envelopeText` is the { status, data } envelope as JSON — decrypted
 * when the answer was encrypted, as sent when the gateway refused the request before decrypting it.
 */
export function apiError(status, envelopeText) {
  return new ApiError(messageFor(status, envelopeText), status);
}

/** The server's encrypted answer couldn't be opened — corrupted in transit, or not from our server. */
export function unreadableAnswer(status) {
  return new ApiError("The server's answer couldn't be read. Reload the page and try again.", status);
}

const UNREACHABLE = "Can't reach the server. Check that the API is running and you're online, then try again.";

/** fetch itself failed: the API is down or unreachable. */
export function unreachable() {
  return new Error(UNREACHABLE);
}

/** Also covers errors thrown before any response exists: the API is down or unreachable. */
export function describeError(message) {
  if (/failed to fetch|networkerror|load failed/i.test(message)) return UNREACHABLE;
  return message;
}
