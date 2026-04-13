/**
 * @file config.js
 * @description GET|POST /api/faculty/config
 *   Faculty-only endpoint to read and update the queue rate limit.
 *   GET  → returns the current queueLimit.
 *   POST → validates and saves a new queueLimit (integer ≥ 1).
 * @module api/faculty/config
 */

import { parseCookies, sendJson }        from "../_lib/http.js";
import { verifySessionToken }             from "../_lib/session.js";
import { setQueueConfig, getQueueConfig } from "../_lib/appwrite.js";

export default async function handler(req, res) {
  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);

    if (!session || session.role !== "faculty") {
      return sendJson(res, 403, { error: "Access denied. Faculty only." });
    }

    if (req.method === "GET") {
      const config = await getQueueConfig();
      return sendJson(res, 200, config);
    }

    if (req.method === "POST") {
      const queueLimit = await _extractQueueLimit(req);
      if (!Number.isFinite(queueLimit) || queueLimit < 1) {
        return sendJson(res, 400, { error: "Invalid queueLimit. Must be a positive integer." });
      }
      const updated = await setQueueConfig(Math.floor(queueLimit));
      return sendJson(res, 200, updated);
    }

    return sendJson(res, 405, { error: "Method not allowed." });

  } catch (error) {
    return sendJson(res, 500, { error: "Failed to handle queue config.", details: error.message });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the queueLimit value from the request body.
 * Supports both pre-parsed (express json middleware) and raw stream bodies.
 *
 * @param {import("http").IncomingMessage} req
 * @returns {Promise<number>}
 */
async function _extractQueueLimit(req) {
  if (req.body && typeof req.body === "object") {
    return Number(req.body.queueLimit);
  }
  const raw = await _readRawBody(req);
  return Number(raw?.queueLimit);
}

/**
 * Read and JSON-parse the raw request body stream.
 * Resolves to {} on any parse or stream error.
 *
 * @param {import("http").IncomingMessage} req
 * @returns {Promise<object>}
 */
async function _readRawBody(req) {
  return new Promise((resolve) => {
    let bodyText = "";
    req.on("data",  (chunk) => { bodyText += chunk.toString(); });
    req.on("end",   () => { try { resolve(JSON.parse(bodyText || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}
