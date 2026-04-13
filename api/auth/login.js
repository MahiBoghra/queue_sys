/**
 * @file login.js
 * @description POST /api/auth/login
 *   Authenticates a student or faculty member by role + identifier + password.
 *   On success, issues a signed HttpOnly session cookie valid for the
 *   configured SESSION_WINDOW_MINUTES duration.
 * @module api/auth/login
 */

import { authenticateUser }                            from "../_lib/appwrite.js";
import { sendJson, setCookie, onlyPost }               from "../_lib/http.js";
import { buildSessionToken, getSessionTtlSeconds }     from "../_lib/session.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;

  try {
    const { role, identifier, rollNumber, facultyId, password } = req.body || {};

    const normalizedRole       = role === "faculty" ? "faculty" : "student";
    const normalizedIdentifier = identifier || (normalizedRole === "student" ? rollNumber : facultyId);

    if (!normalizedIdentifier || !password) {
      return sendJson(res, 400, { error: "identifier and password are required." });
    }

    const user = await authenticateUser(normalizedRole, normalizedIdentifier, password);
    if (!user) {
      return sendJson(res, 401, { error: "Invalid credentials. Please try again." });
    }

    const token      = buildSessionToken(user);
    const ttlSeconds = getSessionTtlSeconds();
    setCookie(res, "session", token, ttlSeconds);

    return sendJson(res, 200, {
      message: "Authenticated",
      user: {
        role:       user.role,
        identifier: user.identifier,
        rollNumber: user.rollNumber,
        facultyId:  user.facultyId,
        name:       user.name,
      },
      expiresInSeconds: ttlSeconds,
    });

  } catch (error) {
    return sendJson(res, 500, { error: "Login failed.", details: error.message });
  }
}
