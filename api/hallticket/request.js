import { getHallticket, getQueueConfig, getActiveQueueCount, updateHallticketQueueStatus } from "../_lib/appwrite.js";
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

    const hallticket = await getHallticket(session.userId);
    if (!hallticket) {
      return sendJson(res, 404, { error: "Hall ticket not found for this user" });
    }

    if (hallticket.status === "DONE" || hallticket.status === "READY") {
      return sendJson(res, 200, {
        status: "ready",
        waitMessage: "Your hall ticket is ready.",
        hallticket,
        docId: hallticket.hallticketId
      });
    }

    if (hallticket.status === "ACTIVE" || hallticket.status === "PENDING") {
      return sendJson(res, 200, {
        status: "queued",
        queueStatus: hallticket.status,
        waitMessage: "Server is processing. Please wait in the virtual queue.",
        docId: hallticket.hallticketId,
        hallticket
      });
    }

    const config = await getQueueConfig();
    const activeCount = await getActiveQueueCount();
    const isSlotAvailable = activeCount < config.queueLimit;
    const newStatus = isSlotAvailable ? "ACTIVE" : "PENDING";
    const queuePosition = Date.now(); // Simple chronological sorting

    await updateHallticketQueueStatus(hallticket.hallticketId, newStatus, queuePosition);

    return sendJson(res, 200, {
        status: "queued",
        queueStatus: newStatus,
        docId: hallticket.hallticketId,
        hallticket,
        waitMessage: "Server is processing. Please wait in the virtual queue.",
    });

  } catch (error) {
    return sendJson(res, 500, { error: "Request failed", details: error.message });
  }
}
