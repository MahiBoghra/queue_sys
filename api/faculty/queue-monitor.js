import {
  getHallticketStatusMap,
  listStudentsForMonitor,
  processPersistentHallticketQueue,
  recalculatePendingQueuePositions,
} from "../_lib/appwrite.js";
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

    if (session.role !== "faculty") {
      return sendJson(res, 403, { error: "Only faculty can access queue monitor" });
    }

    await processPersistentHallticketQueue();
    await recalculatePendingQueuePositions();

    const students = await listStudentsForMonitor();
    const hallticketMap = await getHallticketStatusMap();
    const waitingOrder = Array.from(hallticketMap.entries())
      .filter(([, value]) => value.status === "PENDING")
      .sort((a, b) => (Number(a[1].queuePosition) || 0) - (Number(b[1].queuePosition) || 0));

    const waitingPositionMap = new Map(
      waitingOrder.map(([userId], index) => [userId, index + 1]),
    );

    const rows = students.map((student) => {
      const hallticketUserId = student.rollNumber || student.userId;
      const hallticketMeta = hallticketMap.get(hallticketUserId) || {
        isDownloaded: false,
        status: "IDLE",
        queuePosition: 0,
      };
      const isDownloaded = Boolean(hallticketMeta.isDownloaded) || hallticketMeta.status === "DOWNLOADED";

      let status = "Idle";
      if (isDownloaded) {
        status = "Downloaded";
      } else if (hallticketMeta.status === "READY") {
        status = "Ready";
      } else if (hallticketMeta.status === "PENDING") {
        status = "Waiting";
      }

      return {
        userId: student.userId,
        name: student.name,
        rollNumber: student.rollNumber,
        status,
        queuePosition: status === "Waiting" ? waitingPositionMap.get(hallticketUserId) || 0 : 0,
        isDownloaded,
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
      queueSnapshotLength: waitingCount,
      rows,
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, 500, { error: "Unable to load faculty queue monitor", details: error.message });
  }
}
