import { clearCookie, sendJson, onlyPost } from "../_lib/http.js";

export default async function handler(req, res) {
  if (!onlyPost(req, res)) return;

  clearCookie(res, "session");
  return sendJson(res, 200, { message: "Logged out" });
}
