import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils.js";

import { getSession } from "../auth/session";
import { base64UrlDecode, decryptResponse, encryptRequest } from "./gatewayCrypto";

// The admin portal's half of the secure gateway — the website's code, sending channel "PORTAL":
// builds the { requestHeader, requestBody } envelope, encrypts it for the server's public key, and
// opens the encrypted answer. The format is described in TournamentScheduler.Api/Gateway/README.md.
//
// The server's public key comes from .env (VITE_GATEWAY_KEY_ID / VITE_GATEWAY_PUBLIC_KEY), printed
// by `dotnet run -- gateway-keys show` in the API folder. It is public by design — only the
// server's private key can read what is encrypted with it.

const KEY_ID = import.meta.env.VITE_GATEWAY_KEY_ID;
const PUBLIC_KEY = import.meta.env.VITE_GATEWAY_PUBLIC_KEY;

let serverKey = null;

function serverPublicKey() {
  if (!KEY_ID || !PUBLIC_KEY) {
    throw new Error(
      "The portal has no server key. Add VITE_GATEWAY_KEY_ID and VITE_GATEWAY_PUBLIC_KEY to .env " +
        "(run 'dotnet run -- gateway-keys show' in the API folder), then restart the dev server."
    );
  }
  if (!serverKey) {
    let decoded;
    try {
      decoded = base64UrlDecode(PUBLIC_KEY.trim());
    } catch {
      decoded = new Uint8Array(0);
    }
    if (decoded.length !== 65 || decoded[0] !== 0x04) {
      throw new Error("VITE_GATEWAY_PUBLIC_KEY isn't a server key. Copy it again from 'gateway-keys show'.");
    }
    serverKey = decoded;
  }
  return { keyId: KEY_ID, key: serverKey };
}

// getRandomValues works on any page; crypto.randomUUID only on HTTPS or localhost, so UUIDs are made here.
const randomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

function uuid() {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Groups this page load's requests in the server's logs. Named user flows can refine it later.
const journeyId = uuid();

/** A random id kept per browser — not a fingerprint. */
const deviceId = (() => {
  try {
    const saved = localStorage.getItem("gateway.deviceId");
    if (saved) return saved;
    const created = uuid();
    localStorage.setItem("gateway.deviceId", created);
    return created;
  } catch {
    return journeyId; // storage blocked: still unique enough for this page's logs
  }
})();

/**
 * The signed-in session's token is sealed into the payload as `session` — never put in the clear
 * header, where anyone on the network could copy it. The header carries only the session's id, for
 * the server's logs.
 *
 * @param {string} serviceRequestId
 * @param {{ routeParams?: object, query?: object, body?: unknown }} payload
 * @returns {{ envelope: object, contentKey: Uint8Array, requestUUID: string }}
 */
export function sealRequest(serviceRequestId, payload) {
  const { keyId, key } = serverPublicKey();
  const requestUUID = uuid();
  const timestamp = new Date().toISOString();
  const session = getSession();

  const { token, contentKey } = encryptRequest({
    serverPublicKey: key,
    keyId,
    claims: { serviceRequestId, requestUUID, timestamp },
    plaintext: utf8ToBytes(JSON.stringify(session ? { ...payload, session: session.token } : payload)),
    randomBytes,
  });

  return {
    envelope: {
      requestHeader: {
        serviceRequestId,
        requestUUID,
        timestamp,
        journeyId,
        sessionId: session?.sessionId ?? null,
        channel: "PORTAL",
        appVersion: __APP_VERSION__,
        deviceId,
        keyId,
        apiVersion: "1",
      },
      requestBody: { encryptedData: token },
    },
    contentKey,
    requestUUID,
  };
}

/**
 * The { status, data } envelope inside an encrypted answer, or undefined when the answer wasn't
 * encrypted (the server refused the request before it could decrypt it, so it had no key to reply
 * with). Throws GatewayCryptoError when an encrypted answer can't be opened.
 */
export function openResponse(outer, contentKey) {
  const token = outer?.responseBody?.encryptedData;
  if (typeof token !== "string") return undefined;
  return JSON.parse(bytesToUtf8(decryptResponse(token, contentKey)));
}
