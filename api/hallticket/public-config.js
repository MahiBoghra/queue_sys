import { sendJson, onlyGet } from "../_lib/http.js";
import { 
  APPWRITE_ENDPOINT, 
  APPWRITE_PROJECT_ID, 
  APPWRITE_DATABASE_ID, 
  APPWRITE_HALLTICKETS_COLLECTION_ID 
} from "../_lib/config.js";

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  try {
    return sendJson(res, 200, {
      endpoint: APPWRITE_ENDPOINT,
      projectId: APPWRITE_PROJECT_ID,
      databaseId: APPWRITE_DATABASE_ID,
      hallticketsCollectionId: APPWRITE_HALLTICKETS_COLLECTION_ID
    });
  } catch (error) {
    return sendJson(res, 500, { error: "Failed to get config" });
  }
}
