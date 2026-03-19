import { markHallticketDownloaded } from "../_lib/appwrite.js";
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
      return sendJson(res, 403, { error: "Only students can update download status" });
    }

    const updated = await markHallticketDownloaded(session.userId);
    if (!updated) {
      return sendJson(res, 404, { error: "Hall ticket not found for this user" });
    }

    return sendJson(res, 200, { message: "Download status updated", isDownloaded: true });
  } catch (error) {
    return sendJson(res, 500, { error: "Unable to update download status", details: error.message });
  }
}
