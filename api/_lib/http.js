/**
 * @file http.js
 * @description Shared HTTP utility helpers for API route handlers.
 *   Provides cookie parsing/setting, JSON response shorthand, and
 *   HTTP method guards (onlyGet / onlyPost).
 * @module _lib/http
 */

/**
 * Send a JSON response with the given status code.
 * @param {import("http").ServerResponse} res
 * @param {number} statusCode
 * @param {object} payload
 */
export function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

/**
 * Parse the Cookie request header into a key→value map.
 * @param {import("http").IncomingMessage} req
 * @returns {Record<string, string>}
 */
export function parseCookies(req) {
  const header = req.headers.cookie || "";
  /** @type {Record<string,string>} */
  const parsed = {};

  header.split(";").forEach((part) => {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey) return;
    parsed[rawKey] = decodeURIComponent(rest.join("="));
  });

  return parsed;
}

/**
 * Attach an HttpOnly session cookie to the response.
 * @param {import("http").ServerResponse} res
 * @param {string} key         - Cookie name.
 * @param {string} value       - Cookie value.
 * @param {number} maxAgeSeconds
 */
export function setCookie(res, key, value, maxAgeSeconds) {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookieStr  = `${key}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secureFlag}`;
  res.setHeader("Set-Cookie", cookieStr);
}

/**
 * Expire a named cookie by setting Max-Age=0.
 * @param {import("http").ServerResponse} res
 * @param {string} key
 */
export function clearCookie(res, key) {
  const secureFlag = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${key}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secureFlag}`);
}

/**
 * Guard that returns false (and writes 405) if the request is not POST.
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse}  res
 * @returns {boolean}
 */
export function onlyPost(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return false;
  }
  return true;
}

/**
 * Guard that returns false (and writes 405) if the request is not GET.
 * @param {import("http").IncomingMessage} req
 * @param {import("http").ServerResponse}  res
 * @returns {boolean}
 */
export function onlyGet(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return false;
  }
  return true;
}
