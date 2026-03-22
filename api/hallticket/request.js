import {
  ensurePersistentHallticket,
  getPersistentQueueStatus,
  getStudentHallticketData,
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

    const hallticketUserId = session.rollNumber || session.identifier || session.userId;

    const existingHallticket = await ensurePersistentHallticket(hallticketUserId);

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
      const currentStatus = hallticket.status || "IDLE";
      const shouldEnqueue =
        currentStatus === "IDLE" ||
        currentStatus === "DOWNLOADED" ||
        hallticket.isDownloaded;

      if (shouldEnqueue) {
        await updateHallticketQueueStatus(
          hallticket.documentId,
          "PENDING",
          0,
          { isDownloaded: false, requestedAt: Date.now() },
        );
      }
    }

    const queueResult = await getPersistentQueueStatus(hallticketUserId);

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
      hallticket: queueResult.hallticket || hallticket,
    });

  } catch (error) {
    const rawMessage = error?.message || "Unknown error";

    if (/collection.*not found|could not be found/i.test(rawMessage)) {
      return sendJson(res, 500, {
        error: "Request failed",
        details:
          "Appwrite collection not found. Verify APPWRITE_DATABASE_ID, APPWRITE_HALLTICKETS_COLLECTION_ID and APPWRITE_CONFIG_COLLECTION_ID in Vercel Environment Variables.",
      });
    }

    if (/unknown attribute|attribute.*not found|invalid query/i.test(rawMessage)) {
      return sendJson(res, 500, {
        error: "Request failed",
        details:
          "Halltickets schema mismatch in Appwrite. Minimum required attributes: userId (string), status (string). Recommended: queuePosition (integer), isDownloaded (boolean), hallticketId (string), examName (string), pdfUrl (string).",
      });
    }

    return sendJson(res, 500, { error: "Request failed", details: rawMessage });
  }
}
