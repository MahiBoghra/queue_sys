/**
 * @file logout.js
 * @description POST /api/auth/logout
 *   Expires the session cookie, effectively logging the user out.
 *   Stateless — no server-side session store needs to be updated.
 * @module api/auth/logout
 */

import { clearCookie, sendJson, onlyPost } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;

  clearCookie(res, "session");
  return sendJson(res, 200, { message: "Logged out." });
}
