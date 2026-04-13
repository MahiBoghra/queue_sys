/**
 * @file mark-downloaded.js
 * @description POST /api/hallticket/mark-downloaded
 *   Called by the frontend immediately after the student successfully
 *   downloads their hall ticket.  Updates both the in-memory queue engine
 *   and the persistent DB record.
 * @module api/hallticket/mark-downloaded
 */

import { markHallticketDownloaded, getStudentHallticketData } from "../_lib/appwrite.js";
import { parseCookies, sendJson, onlyPost }                    from "../_lib/http.js";
import { verifySessionToken }                                   from "../_lib/session.js";
import { markDownloaded }                                       from "../_lib/queueEngine.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;

  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);

    if (!session) {
      return sendJson(res, 401, { error: "Session expired. Please login again." });
    }

    if (session.role !== "student") {
      return sendJson(res, 403, { error: "Only students can update download status." });
    }

    // Update the in-memory queue state first (fast, always succeeds).
    markDownloaded(session.userId);

    // Then attempt to persist to the DB.
    const updated = await markHallticketDownloaded(session.userId);
    if (!updated) {
      // No persistent record exists — validate the user exists and return OK.
      const studentData = await getStudentHallticketData(session.userId);
      if (!studentData) {
        return sendJson(res, 404, { error: "Student record not found." });
      }
      return sendJson(res, 200, {
        message:      "Download completed (no persistent hall ticket record to update).",
        isDownloaded: true,
      });
    }

    return sendJson(res, 200, { message: "Download status updated.", isDownloaded: true });

  } catch (error) {
    return sendJson(res, 500, { error: "Unable to update download status.", details: error.message });
  }
}
