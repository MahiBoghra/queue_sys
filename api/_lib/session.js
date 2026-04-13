/**
 * @file session.js
 * @description Stateless session token utilities.
 *   Tokens are signed HMAC-SHA256 payloads encoded as base64url strings.
 *   No server-side storage is required; expiry is validated on every request.
 * @module _lib/session
 */

import crypto from "crypto";
import { SESSION_WINDOW_MINUTES, TOKEN_SECRET } from "./config.js";

// ---------------------------------------------------------------------------
// Module-level constants  (no globals exported)
// ---------------------------------------------------------------------------

/** Session TTL in seconds, derived from the configured window. */
const SESSION_TTL_SECONDS = SESSION_WINDOW_MINUTES * 60;

// ---------------------------------------------------------------------------
// Internal helpers  (underscore prefix = private)
// ---------------------------------------------------------------------------

/**
 * Produce an HMAC-SHA256 hex digest of `raw` using TOKEN_SECRET.
 * @param {string} raw
 * @returns {string}
 */
function _sign(raw) {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(raw).digest("hex");
}

/**
 * Encode a UTF-8 string as base64url.
 * @param {string} input
 * @returns {string}
 */
function _toBase64(input) {
  return Buffer.from(input, "utf8").toString("base64url");
}

/**
 * Decode a base64url string back to UTF-8.
 * @param {string} input
 * @returns {string}
 */
function _fromBase64(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a signed session token for the given user.
 * @param {{ userId: string, role: string, identifier: string, rollNumber?: string, facultyId?: string, name: string }} user
 * @returns {string} Signed token string.
 */
export function buildSessionToken(user) {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;

  const payload = {
    userId:     user.userId,
    role:       user.role,
    identifier: user.identifier,
    rollNumber: user.rollNumber,
    facultyId:  user.facultyId,
    name:       user.name,
    expiresAt,
  };

  const encodedPayload = _toBase64(JSON.stringify(payload));
  const signature      = _sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

/**
 * Verify a session token and return its payload, or null if invalid/expired.
 * @param {string} token
 * @returns {object|null}
 */
export function verifySessionToken(token) {
  if (!token || !token.includes(".")) return null;

  const [encodedPayload, signature] = token.split(".");
  if (_sign(encodedPayload) !== signature) return null;

  try {
    const payload = JSON.parse(_fromBase64(encodedPayload));
    if (!payload.expiresAt || Date.now() > Number(payload.expiresAt)) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Return the configured session TTL in seconds.
 * @returns {number}
 */
export function getSessionTtlSeconds() {
  return SESSION_TTL_SECONDS;
}
