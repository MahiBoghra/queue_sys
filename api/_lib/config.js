/**
 * @file config.js
 * @description Centralised configuration loaded from environment variables.
 *   All values have safe defaults so the app works out-of-the-box in
 *   development / mock mode without any .env file.
 * @module _lib/config
 */

// ---------------------------------------------------------------------------
// Tunables (overrideable via environment variables)
// ---------------------------------------------------------------------------

/** Minutes a login session stays alive before auto-logout. @type {number} */
const SESSION_WINDOW_MINUTES = Number(process.env.SESSION_WINDOW_MINUTES || 20);

/** Seconds a "ready" download slot stays open before expiring. @type {number} */
const DOWNLOAD_WINDOW_SECONDS = Number(process.env.DOWNLOAD_WINDOW_SECONDS || 120);

/** Maximum users promoted from queue to "ready" per second. @type {number} */
const QUEUE_RATE_LIMIT_PER_SECOND = Number(process.env.QUEUE_RATE_LIMIT_PER_SECOND || 5);

/** Seconds a new job waits in queue before it becomes eligible to be served. @type {number} */
const HALLTICKET_PREPARE_SECONDS = Number(process.env.HALLTICKET_PREPARE_SECONDS || 120);

/** HMAC secret used to sign session tokens. MUST be overridden in production. @type {string} */
const TOKEN_SECRET = process.env.TOKEN_SECRET || "change-this-secret";

// ---------------------------------------------------------------------------
// Appwrite connection (all optional — falls back to in-memory mock store)
// ---------------------------------------------------------------------------

/** @type {string} */
const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || "";

/** @type {string} */
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID || "";

/** @type {string} */
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY || "";

/** @type {string} */
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID || "";

/** @type {string} */
const APPWRITE_USERS_COLLECTION_ID = process.env.APPWRITE_USERS_COLLECTION_ID || "";

/** @type {string} */
const APPWRITE_HALLTICKETS_COLLECTION_ID = process.env.APPWRITE_HALLTICKETS_COLLECTION_ID || "";

/** @type {string} */
const APPWRITE_CONFIG_COLLECTION_ID = process.env.APPWRITE_CONFIG_COLLECTION_ID || "";

export {
  SESSION_WINDOW_MINUTES,
  DOWNLOAD_WINDOW_SECONDS,
  QUEUE_RATE_LIMIT_PER_SECOND,
  HALLTICKET_PREPARE_SECONDS,
  TOKEN_SECRET,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY,
  APPWRITE_DATABASE_ID,
  APPWRITE_USERS_COLLECTION_ID,
  APPWRITE_HALLTICKETS_COLLECTION_ID,
  APPWRITE_CONFIG_COLLECTION_ID,
};
