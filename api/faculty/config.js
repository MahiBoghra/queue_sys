import { parseCookies, sendJson, onlyPost, onlyGet } from "../_lib/http.js";
import { verifySessionToken } from "../_lib/session.js";
import { setQueueConfig, getQueueConfig } from "../_lib/appwrite.js";

export default async function handler(req, res) {
  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);

    if (!session || session.role !== "faculty") {
      return sendJson(res, 403, { error: "Access denied. Faculty only." });
    }

    if (req.method === "GET") {
      const config = await getQueueConfig();
      return sendJson(res, 200, config);
    }

    if (req.method === "POST") {
      const body = await parseBody(req);
      if (!body.queueLimit || typeof body.queueLimit !== "number") {
        return sendJson(res, 400, { error: "Invalid queueLimit. Must be a number." });
      }

      const updated = await setQueueConfig(body.queueLimit);
      return sendJson(res, 200, updated);
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return sendJson(res, 500, { error: "Failed to handle config", details: error.message });
  }
}

async function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}
