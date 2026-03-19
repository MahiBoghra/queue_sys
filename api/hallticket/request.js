import { getHallticket } from "../_lib/appwrite.js";
import { parseCookies, sendJson, onlyPost } from "../_lib/http.js";
import { verifySessionToken } from "../_lib/session.js";
import { requestSlot } from "../_lib/queueEngine.js";

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

    const queueResult = requestSlot(session.userId, hallticket);

    return sendJson(res, 200, {
      ...queueResult,
      serverMeta: {
        rateLimitPerSecond: Number(process.env.QUEUE_RATE_LIMIT_PER_SECOND || 5),
      },
    });
  } catch (error) {
    return sendJson(res, 500, { error: "Request failed", details: error.message });
  }
}
