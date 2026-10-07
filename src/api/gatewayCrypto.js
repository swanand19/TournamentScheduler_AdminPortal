import { gcm } from "@noble/ciphers/aes.js";
import { bytesToUtf8, utf8ToBytes } from "@noble/ciphers/utils.js";
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";

// The encryption on both legs of a gateway call — JWE (RFC 7516), compact serialisation — exactly
// as the API's Gateway/GatewayCrypto.cs does it:
//
//   request   alg ECDH-ES, enc A256GCM: a throwaway P-256 key agrees a one-time AES-256 key with
//             the server's public key, so only the server can read the request.
//   response  alg dir, enc A256GCM with that same one-time key, so only this page can read the answer.
//
// Pure: no browser APIs, randomness is passed in. That keeps it identical to the phone app's copy
// (tournament-scheduler-mobile/src/api/gatewayCrypto.ts) and lets Node check it against the shared
// test vectors (scripts/verify-gateway-vectors.mjs). Change one copy, change the other.
//
// @noble rather than the browser's WebCrypto: WebCrypto only exists on HTTPS or localhost pages,
// and the phone app needs the same code anyway.

const ENC = "A256GCM";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class GatewayCryptoError extends Error {
  constructor(message) {
    super(message);
    this.name = "GatewayCryptoError";
  }
}

// ---------------------------------------------------------------------------
// Base64url (RFC 4648 §5, no padding)
// ---------------------------------------------------------------------------

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function base64UrlEncode(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

export function base64UrlDecode(text) {
  if (text.length % 4 === 1) throw new GatewayCryptoError("Not base64url.");
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let index = 0;
  for (const c of text) {
    const v = LOOKUP.get(c);
    if (v === undefined) throw new GatewayCryptoError("Not base64url.");
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

function uint32(n) {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** NIST Concat KDF as JWE uses it (RFC 7518 §4.6.2): one SHA-256 round, AlgorithmID = "enc". */
export function concatKdf(sharedSecret, algorithmId, apu, apv, keyBits = 256) {
  const algorithm = utf8ToBytes(algorithmId);
  const input = concat(
    uint32(1),
    sharedSecret,
    uint32(algorithm.length), algorithm,
    uint32(apu.length), apu,
    uint32(apv.length), apv,
    uint32(keyBits)
  );
  return sha256(input).slice(0, keyBits / 8);
}

function newEphemeralSecret(randomBytes) {
  // Out-of-range values (about 1 in 2^32) are simply drawn again.
  for (;;) {
    const candidate = randomBytes(32);
    if (p256.utils.isValidSecretKey(candidate)) return candidate;
  }
}

// ---------------------------------------------------------------------------
// Request (the page's side of ECDH-ES)
// ---------------------------------------------------------------------------

/**
 * @param {{ serverPublicKey: Uint8Array, keyId: string, claims: Record<string, string>,
 *           plaintext: Uint8Array, randomBytes: (n: number) => Uint8Array,
 *           ephemeralSecretKey?: Uint8Array, iv?: Uint8Array }} args
 *   ephemeralSecretKey and iv are only fixed by the shared test vectors.
 * @returns {{ token: string, contentKey: Uint8Array }}
 */
export function encryptRequest(args) {
  const secret = args.ephemeralSecretKey ?? newEphemeralSecret(args.randomBytes);
  const ephemeralPublic = p256.getPublicKey(secret, false); // 0x04 || X || Y

  const header = {
    alg: "ECDH-ES",
    enc: ENC,
    kid: args.keyId,
    epk: {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(ephemeralPublic.slice(1, 33)),
      y: base64UrlEncode(ephemeralPublic.slice(33, 65)),
    },
    ...args.claims,
  };

  // The shared secret is the x-coordinate of the agreed point.
  const shared = p256.getSharedSecret(secret, args.serverPublicKey, true).slice(1);
  const contentKey = concatKdf(shared, ENC, new Uint8Array(0), new Uint8Array(0));
  shared.fill(0);
  if (!args.ephemeralSecretKey) secret.fill(0);

  return { token: seal(header, contentKey, args.plaintext, args.iv ?? args.randomBytes(IV_BYTES)), contentKey };
}

// ---------------------------------------------------------------------------
// Response (alg dir, with the request's key)
// ---------------------------------------------------------------------------

export function decryptResponse(token, contentKey) {
  const parts = token.split(".");
  if (parts.length !== 5) throw new GatewayCryptoError("A compact JWE has five parts.");

  let header;
  try {
    header = JSON.parse(bytesToUtf8(base64UrlDecode(parts[0])));
  } catch {
    throw new GatewayCryptoError("The response header is not valid.");
  }
  if (header.alg !== "dir" || header.enc !== ENC) throw new GatewayCryptoError("Unexpected response algorithm.");

  const iv = base64UrlDecode(parts[2]);
  const ciphertext = base64UrlDecode(parts[3]);
  const tag = base64UrlDecode(parts[4]);
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new GatewayCryptoError("Wrong IV or tag length.");

  try {
    return gcm(contentKey, iv, utf8ToBytes(parts[0])).decrypt(concat(ciphertext, tag));
  } catch {
    throw new GatewayCryptoError("The response failed its integrity check.");
  }
}

/** For the vector check: the server's side of the response, so both directions can be compared. */
export function encryptResponse(plaintext, contentKey, requestUUID, iv) {
  const header = { alg: "dir", enc: ENC };
  if (requestUUID !== null) header.requestUUID = requestUUID;
  return seal(header, contentKey, plaintext, iv);
}

function seal(header, contentKey, plaintext, iv) {
  const encodedHeader = base64UrlEncode(utf8ToBytes(JSON.stringify(header)));
  const sealed = gcm(contentKey, iv, utf8ToBytes(encodedHeader)).encrypt(plaintext); // ciphertext || tag
  return [
    encodedHeader,
    "",
    base64UrlEncode(iv),
    base64UrlEncode(sealed.slice(0, sealed.length - TAG_BYTES)),
    base64UrlEncode(sealed.slice(sealed.length - TAG_BYTES)),
  ].join(".");
}
