import { parseCookies, sendJson, onlyGet } from "../_lib/http.js";
import { verifySessionToken } from "../_lib/session.js";
import { getDashboardInfo } from "../_lib/appwrite.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);
    if (!session) {
      return sendJson(res, 401, { error: "Session expired. Please login again." });
    }

    const dashboardInfo = await getDashboardInfo(session.userId);
    if (!dashboardInfo) {
      return sendJson(res, 404, { error: "Dashboard details not found" });
    }

    return sendJson(res, 200, {
      user: {
        role: session.role,
        identifier: session.identifier,
        name: session.name,
        rollNumber: session.rollNumber,
        facultyId: session.facultyId,
      },
      dashboardInfo,
      sessionExpiresAt: session.expiresAt,
    });
  } catch (error) {
    return sendJson(res, 500, { error: "Unable to fetch session", details: error.message });
  }
}
