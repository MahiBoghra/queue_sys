import { getHallticketStatusMap, listStudentsForMonitor } from "../_lib/appwrite.js";
import { parseCookies, sendJson, onlyGet } from "../_lib/http.js";
import { verifySessionToken } from "../_lib/session.js";
import { getQueueMetaForUser, getQueueSnapshot } from "../_lib/queueEngine.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);

    if (!session) {
      return sendJson(res, 401, { error: "Session expired. Please login again." });
    }

    if (session.role !== "faculty") {
      return sendJson(res, 403, { error: "Only faculty can access queue monitor" });
    }

    const students = await listStudentsForMonitor();
    const hallticketMap = await getHallticketStatusMap();
    const queueSnapshot = getQueueSnapshot();

    const rows = students.map((student) => {
      const queueMeta = getQueueMetaForUser(student.userId);
      const hallticketMeta = hallticketMap.get(student.userId) || { isDownloaded: false };

      let status = "Idle";
      if (hallticketMeta.isDownloaded) {
        status = "Downloaded";
      } else if (queueMeta.status === "ready") {
        status = "Ready";
      } else if (queueMeta.status === "waiting") {
        status = "Waiting";
      }

      return {
        userId: student.userId,
        name: student.name,
        rollNumber: student.rollNumber,
        status,
        queuePosition: status === "Waiting" ? queueMeta.queuePosition : 0,
        isDownloaded: Boolean(hallticketMeta.isDownloaded),
      };
    });

    const waitingCount = rows.filter((row) => row.status === "Waiting").length;
    const readyCount = rows.filter((row) => row.status === "Ready").length;
    const activeRequests = waitingCount + readyCount;

    return sendJson(res, 200, {
      queueLength: waitingCount,
      waitingCount,
      readyCount,
      activeRequests,
      queueSnapshotLength: queueSnapshot.queue.length,
      rows,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, 500, { error: "Unable to load faculty queue monitor", details: error.message });
  }
}
