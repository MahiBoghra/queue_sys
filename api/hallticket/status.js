import { parseCookies, sendJson, onlyGet } from "../_lib/http.js";
import { verifySessionToken } from "../_lib/session.js";
import { getPersistentQueueStatus, processPersistentHallticketQueue } from "../_lib/appwrite.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);

    if (!session) {
      return sendJson(res, 401, { error: "Session expired. Please login again." });
    }

    if (session.role !== "student") {
      return sendJson(res, 403, {
        error: "Hall ticket queue status is available only for student accounts",
      });
    }

    await processPersistentHallticketQueue();
    const status = await getPersistentQueueStatus(session.userId);
    return sendJson(res, 200, status);
  } catch (error) {
    return sendJson(res, 500, { error: "Status check failed", details: error.message });
  }
}
