/**
 * @file request.js
 * @description POST /api/hallticket/request
 *   Authenticated students call this to enter the virtual download queue.
 *   Returns status "ready" (slot immediately available) or "queued" (waiting).
 * @module api/hallticket/request
 */

import { getHallticket, getStudentHallticketData } from "../_lib/appwrite.js";
import { parseCookies, sendJson, onlyPost }         from "../_lib/http.js";
import { verifySessionToken }                        from "../_lib/session.js";
import { requestSlot }                               from "../_lib/queueEngine.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;

  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);

    if (!session) {
      return sendJson(res, 401, { error: "Session expired. Please login again." });
    }

    if (session.role !== "student") {
      return sendJson(res, 403, { error: "Hall ticket queue is available only for student accounts." });
    }

    // Attempt to load an existing hall-ticket record; fall back to a virtual one.
    const existingHallticket = await getHallticket(session.userId);
    let hallticket = existingHallticket;

    if (!hallticket) {
      const studentData = await getStudentHallticketData(session.userId);
      if (!studentData) {
        return sendJson(res, 404, { error: "Student record not found." });
      }

      hallticket = {
        hallticketId: `virtual-${session.userId}`,
        examName:     "Final Semester Examination 2026",
        pdfUrl:       "",
        isDownloaded: false,
      };
    }

    const queueResult = requestSlot(session.userId, hallticket);

    if (queueResult.status === "ready") {
      return sendJson(res, 200, {
        status:      "ready",
        waitMessage: queueResult.waitMessage,
        hallticket:  queueResult.hallticket,
        docId:       queueResult.hallticket?.hallticketId,
        expiresAt:   queueResult.expiresAt,
      });
    }

    return sendJson(res, 200, {
      status:                  "queued",
      queueStatus:             "PENDING",
      position:                queueResult.position,
      aheadCount:              queueResult.aheadCount,
      queueLength:             queueResult.queueLength,
      processingRatePerSecond: queueResult.processingRatePerSecond,
      estimatedWaitSeconds:    queueResult.estimatedWaitSeconds,
      nextTurnAt:              queueResult.nextTurnAt,
      waitMessage:             queueResult.waitMessage,
      docId:                   hallticket.hallticketId,
      hallticket,
    });

  } catch (error) {
    return sendJson(res, 500, { error: "Request failed.", details: error.message });
  }
}
