// npm run verify:gateway — checks the portal's src/api/gatewayCrypto.js against the shared gateway
// test vectors (TournamentScheduler.Tests/Gateway/gateway-vectors.json), which the API's C# tests, the
// website and the phone app check too. If this fails, the portal and the server no longer speak the
// same encryption.
import assert from "node:assert/strict";
import fs from "node:fs";

import { concatKdf, base64UrlDecode, base64UrlEncode, decryptResponse, encryptRequest, encryptResponse } from "../src/api/gatewayCrypto.js";

const vectors = JSON.parse(fs.readFileSync(new URL("../../TournamentScheduler.Tests/Gateway/gateway-vectors.json", import.meta.url), "utf8"));
const utf8 = (s) => new TextEncoder().encode(s);
const text = (b) => new TextDecoder().decode(b);
const hex = (h) => Uint8Array.from(h.match(/../g).map((b) => parseInt(b, 16)));
const noRandom = () => {
  throw new Error("The vectors fix every random input.");
};

// Base64url round-trips every length's padding case.
for (let n = 0; n < 40; n++) {
  const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 0xff);
  assert.deepEqual(base64UrlDecode(base64UrlEncode(bytes)), bytes);
  assert.equal(base64UrlEncode(bytes), Buffer.from(bytes).toString("base64url"));
}

// The key derivation, against the worked example in RFC 7518 Appendix C.
const rfc = vectors.rfc7518AppendixC;
assert.equal(
  base64UrlEncode(concatKdf(base64UrlDecode(rfc.sharedSecret), rfc.algorithmId, utf8(rfc.apu), utf8(rfc.apv), rfc.keyBits)),
  rfc.derivedKey
);

// The request, byte for byte.
const sealed = encryptRequest({
  serverPublicKey: base64UrlDecode(vectors.server.publicKey),
  keyId: vectors.server.keyId,
  claims: vectors.request.claims,
  plaintext: utf8(vectors.request.plaintext),
  randomBytes: noRandom,
  ephemeralSecretKey: hex(vectors.request.ephemeralSecretKeyHex),
  iv: base64UrlDecode(vectors.request.iv),
});
assert.equal(sealed.token, vectors.request.token);
assert.equal(base64UrlEncode(sealed.contentKey), vectors.request.contentKey);

// The server's response opens, and is exactly what the server would produce.
const contentKey = base64UrlDecode(vectors.request.contentKey);
assert.equal(text(decryptResponse(vectors.response.token, contentKey)), vectors.response.plaintext);
assert.equal(
  encryptResponse(utf8(vectors.response.plaintext), contentKey, vectors.response.requestUUID, base64UrlDecode(vectors.response.iv)),
  vectors.response.token
);

// A changed byte anywhere is refused.
const parts = vectors.response.token.split(".");
const tag = base64UrlDecode(parts[4]);
tag[0] ^= 1;
parts[4] = base64UrlEncode(tag);
assert.throws(() => decryptResponse(parts.join("."), contentKey), /integrity/);

console.log("Gateway crypto matches the shared vectors.");
