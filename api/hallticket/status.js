/**
 * @file status.js
 * @description GET /api/hallticket/status
 *   Returns the current queue/download status for the authenticated student.
 *   Polled by the frontend every 3 seconds while the student is waiting.
 * @module api/hallticket/status
 */

import { parseCookies, sendJson, onlyGet } from "../_lib/http.js";
import { verifySessionToken }               from "../_lib/session.js";
import { getStatus }                        from "../_lib/queueEngine.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);

    if (!session) {
      return sendJson(res, 401, { error: "Session expired. Please login again." });
    }

    if (session.role !== "student") {
      return sendJson(res, 403, { error: "Hall ticket queue status is available only for student accounts." });
    }

    const statusResult = getStatus(session.userId);
    return sendJson(res, 200, statusResult);

  } catch (error) {
    return sendJson(res, 500, { error: "Status check failed.", details: error.message });
  }
}
