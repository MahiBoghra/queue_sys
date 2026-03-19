import { sendJson, onlyGet } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  sendJson(res, 200, {
    service: "queue-hallticket-middleware",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
