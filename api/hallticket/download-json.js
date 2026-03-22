import { getPersistentQueueStatus, getStudentHallticketData, processPersistentHallticketQueue } from "../_lib/appwrite.js";
import { parseCookies, sendJson, onlyGet } from "../_lib/http.js";
import { verifySessionToken } from "../_lib/session.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);

    if (!session) {
      return sendJson(res, 401, { error: "Session expired. Please login again." });
    }

    if (session.role !== "student") {
      return sendJson(res, 403, { error: "Only students can download hall ticket JSON" });
    }

    const hallticketUserId = session.rollNumber || session.identifier || session.userId;

    await processPersistentHallticketQueue();
    const queueStatus = await getPersistentQueueStatus(hallticketUserId);
    if (queueStatus.status !== "ready" && queueStatus.status !== "downloaded") {
      return sendJson(res, 409, {
        error: "Hall ticket is not ready yet. Please wait in queue.",
        queueStatus,
      });
    }

    const studentData = await getStudentHallticketData(session.userId);
    if (!studentData) {
      return sendJson(res, 404, { error: "Student record not found" });
    }

    return sendJson(res, 200, {
      hallticketData: studentData,
      downloadFileName: `hallticket_${studentData.rollNumber}.json`,
    });
  } catch (error) {
    return sendJson(res, 500, { error: "Unable to prepare JSON download", details: error.message });
  }
}
