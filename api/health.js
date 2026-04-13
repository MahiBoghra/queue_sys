/**
 * @file health.js
 * @description GET /api/health
 *   Lightweight liveness probe.  Returns service name, status, and current
 *   server timestamp.  Used by uptime monitors and load balancers to confirm
 *   the process is running and routing requests correctly.
 * @module api/health
 */

import { sendJson, onlyGet } from "./_lib/http.js";
import {
  APPWRITE_CONFIG_COLLECTION_ID,
  APPWRITE_DATABASE_ID,
  APPWRITE_ENDPOINT,
  APPWRITE_HALLTICKETS_COLLECTION_ID,
  APPWRITE_PROJECT_ID,
  APPWRITE_USERS_COLLECTION_ID,
} from "./_lib/config.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  return sendJson(res, 200, {
    service:   "queue-hallticket-middleware",
    status:    "ok",
    timestamp: new Date().toISOString(),
    appwriteConfig: {
      hasEndpoint: Boolean(APPWRITE_ENDPOINT),
      hasProjectId: Boolean(APPWRITE_PROJECT_ID),
      hasDatabaseId: Boolean(APPWRITE_DATABASE_ID),
      hasUsersCollectionId: Boolean(APPWRITE_USERS_COLLECTION_ID),
      hasHallticketsCollectionId: Boolean(APPWRITE_HALLTICKETS_COLLECTION_ID),
      hasConfigCollectionId: Boolean(APPWRITE_CONFIG_COLLECTION_ID),
    },
  });
}
