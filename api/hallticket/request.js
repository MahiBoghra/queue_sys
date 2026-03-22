import {
  ensurePersistentHallticket,
  getPersistentQueueStatus,
  getStudentHallticketData,
  processPersistentHallticketQueue,
  updateHallticketQueueStatus,
} from "../_lib/appwrite.js";
import { parseCookies, sendJson, onlyPost } from "../_lib/http.js";
import { verifySessionToken } from "../_lib/session.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;

  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);

    if (!session) {
      return sendJson(res, 401, { error: "Session expired. Please login again." });
    }

    if (session.role !== "student") {
      return sendJson(res, 403, {
        error: "Hall ticket queue is available only for student accounts",
      });
    }

    const existingHallticket = await ensurePersistentHallticket(session.userId);

    let hallticket = existingHallticket;
    if (!hallticket) {
      const studentData = await getStudentHallticketData(session.userId);
      if (!studentData) {
        return sendJson(res, 404, { error: "Student record not found" });
      }

      hallticket = {
        documentId: null,
        hallticketId: `virtual-${session.userId}`,
        examName: "Final Semester Examination 2026",
        pdfUrl: "",
        isDownloaded: false,
      };
    }

    if (hallticket.documentId) {
      if (hallticket.status !== "READY" || hallticket.isDownloaded) {
        await updateHallticketQueueStatus(
          hallticket.documentId,
          "PENDING",
          Date.now(),
          { isDownloaded: false },
        );
      }

      await processPersistentHallticketQueue();
    }

    const queueResult = await getPersistentQueueStatus(session.userId);

    if (queueResult.status === "ready") {
      return sendJson(res, 200, {
        status: "ready",
        waitMessage: queueResult.waitMessage,
        hallticket: queueResult.hallticket,
        docId: queueResult.hallticket?.documentId || queueResult.hallticket?.hallticketId,
        expiresAt: queueResult.expiresAt,
      });
    }

    return sendJson(res, 200, {
      status: "queued",
      queueStatus: "PENDING",
      position: queueResult.position,
      aheadCount: queueResult.aheadCount,
      queueLength: queueResult.queueLength,
      processingRatePerSecond: queueResult.processingRatePerSecond,
      preparationWaitSeconds: queueResult.preparationWaitSeconds,
      estimatedWaitSeconds: queueResult.estimatedWaitSeconds,
      nextTurnAt: queueResult.nextTurnAt,
      waitMessage: queueResult.waitMessage,
      docId: queueResult.hallticket?.documentId || hallticket.documentId || hallticket.hallticketId,
      hallticket,
    });

  } catch (error) {
    return sendJson(res, 500, { error: "Request failed", details: error.message });
  }
}
