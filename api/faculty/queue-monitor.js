/**
 * @file queue-monitor.js
 * @description GET /api/faculty/queue-monitor
 *   Faculty-only dashboard data endpoint.  Merges the student list from
 *   the DB with live queue state from the engine to produce a per-student
 *   status table (Idle / Waiting / Ready / Downloaded).
 * @module api/faculty/queue-monitor
 */

import { getHallticketStatusMap, listStudentsForMonitor } from "../_lib/appwrite.js";
import { parseCookies, sendJson, onlyGet }                from "../_lib/http.js";
import { verifySessionToken }                              from "../_lib/session.js";
import { getQueueMetaForUser, getQueueSnapshot }           from "../_lib/queueEngine.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);

    if (!session) {
      return sendJson(res, 401, { error: "Session expired. Please login again." });
    }

    if (session.role !== "faculty") {
      return sendJson(res, 403, { error: "Only faculty can access the queue monitor." });
    }

    const [students, hallticketMap, queueSnapshot] = await Promise.all([
      listStudentsForMonitor(),
      getHallticketStatusMap(),
      Promise.resolve(getQueueSnapshot()),
    ]);

    const rows = students.map((student) => _buildStudentRow(student, hallticketMap, queueSnapshot));

    const waitingCount   = rows.filter((row) => row.status === "Waiting").length;
    const readyCount     = rows.filter((row) => row.status === "Ready").length;
    const activeRequests = waitingCount + readyCount;

    return sendJson(res, 200, {
      queueLength:         waitingCount,
      waitingCount,
      readyCount,
      activeRequests,
      queueSnapshotLength: queueSnapshot.queue.length,
      rows,
      refreshedAt:         new Date().toISOString(),
    });

  } catch (error) {
    return sendJson(res, 500, {
      error:   "Unable to load faculty queue monitor.",
      details: error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the monitor row for a single student, merging DB and live queue data.
 *
 * @param {object}             student        - Student record from DB.
 * @param {Map<string,object>} hallticketMap  - DB download-status map keyed by userId.
 * @param {object}             queueSnapshot  - Live snapshot from queueEngine.
 * @returns {{ userId, name, rollNumber, status, queuePosition, isDownloaded }}
 */
function _buildStudentRow(student, hallticketMap, queueSnapshot) {
  const queueMeta     = getQueueMetaForUser(student.userId);
  const hallticketMeta = hallticketMap.get(student.userId) || { isDownloaded: false };
  const isDownloaded  = Boolean(hallticketMeta.isDownloaded) || queueMeta.status === "downloaded";

  let displayStatus = "Idle";
  if (isDownloaded) {
    displayStatus = "Downloaded";
  } else if (queueMeta.status === "ready") {
    displayStatus = "Ready";
  } else if (queueMeta.status === "waiting") {
    displayStatus = "Waiting";
  }

  return {
    userId:        student.userId,
    name:          student.name,
    rollNumber:    student.rollNumber,
    status:        displayStatus,
    queuePosition: displayStatus === "Waiting" ? queueMeta.queuePosition : 0,
    isDownloaded,
  };
}
