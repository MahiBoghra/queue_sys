import { parseCookies, sendJson } from "../_lib/http.js";
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
      const queueLimit = await extractQueueLimit(req);
      if (!Number.isFinite(queueLimit) || queueLimit < 1) {
        return sendJson(res, 400, { error: "Invalid queueLimit. Must be a number." });
      }

      const updated = await setQueueConfig(Math.floor(queueLimit));
      return sendJson(res, 200, updated);
    }

    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return sendJson(res, 500, { error: "Failed to handle config", details: error.message });
  }
}

async function extractQueueLimit(req) {
  if (req.body && typeof req.body === "object") {
    return Number(req.body.queueLimit);
  }

  const raw = await readRawBody(req);
  return Number(raw?.queueLimit);
}

async function readRawBody(req) {
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

    req.on("error", () => resolve({}));
  });
}
