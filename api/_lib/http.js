export function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const parsed = {};

  header.split(";").forEach((cookiePart) => {
    const [rawKey, ...rest] = cookiePart.trim().split("=");
    if (!rawKey) return;
    parsed[rawKey] = decodeURIComponent(rest.join("="));
  });

  return parsed;
}

export function setCookie(res, key, value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${key}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`;
  res.setHeader("Set-Cookie", cookie);
}

export function clearCookie(res, key) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${key}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);
}

export function onlyPost(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return false;
  }
  return true;
}

export function onlyGet(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return false;
  }
  return true;
}
