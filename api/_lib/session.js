import crypto from "crypto";
import { SESSION_WINDOW_MINUTES, TOKEN_SECRET } from "./config.js";

const TOKEN_TTL_SECONDS = SESSION_WINDOW_MINUTES * 60;

function sign(raw) {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(raw).digest("hex");
}

function toBase64(input) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64(input) {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function buildSessionToken(user) {
  const expiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
  const payload = {
    userId: user.userId,
    role: user.role,
    identifier: user.identifier,
    rollNumber: user.rollNumber,
    facultyId: user.facultyId,
    name: user.name,
    expiresAt,
  };

  const encodedPayload = toBase64(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || !token.includes(".")) return null;

  const [encodedPayload, signature] = token.split(".");
  const expected = sign(encodedPayload);

  if (signature !== expected) return null;

  try {
    const payload = JSON.parse(fromBase64(encodedPayload));
    if (!payload.expiresAt || Date.now() > Number(payload.expiresAt)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getSessionTtlSeconds() {
  return TOKEN_TTL_SECONDS;
}
