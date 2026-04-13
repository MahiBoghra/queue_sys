/**
 * @file signup.js
 * @description POST /api/auth/signup
 *   Creates a new student or faculty account.
 *   Validates required fields per role before delegating to the data layer.
 *   Returns 409 if the identifier (roll number / faculty ID) is already taken.
 * @module api/auth/signup
 */

import { createUser }          from "../_lib/appwrite.js";
import { sendJson, onlyPost }  from "../_lib/http.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;

  try {
    const {
      role,
      name,
      password,
      identifier,
      course,
      semester,
      examDate,
      center,
      department,
      designation,
    } = req.body || {};

    const normalizedRole     = role === "faculty" ? "faculty" : "student";
    const normalizedSemester = Number.parseInt(String(semester), 10);

    if (!name || !password || !identifier) {
      return sendJson(res, 400, { error: "role, name, identifier and password are required." });
    }

    if (normalizedRole === "student" && (!course || !semester || !examDate || !center)) {
      return sendJson(res, 400, {
        error: "course, semester, examDate and center are required for student signup.",
      });
    }

    if (normalizedRole === "student" && !Number.isInteger(normalizedSemester)) {
      return sendJson(res, 400, {
        error: "semester must be a valid integer (e.g. 1, 2, 8).",
      });
    }

    if (normalizedRole === "faculty" && (!department || !designation)) {
      return sendJson(res, 400, {
        error: "department and designation are required for faculty signup.",
      });
    }

    const createdUser = await createUser({
      role:        normalizedRole,
      name,
      password,
      identifier,
      course,
      semester:    normalizedRole === "student" ? normalizedSemester : null,
      examDate,
      center,
      department,
      designation,
    });

    return sendJson(res, 201, {
      message: "Signup successful.",
      user:    createdUser,
    });

  } catch (error) {
    const statusCode = error.message === "Identifier already exists" ? 409 : 500;
    return sendJson(res, statusCode, { error: error.message || "Signup failed." });
  }
}
