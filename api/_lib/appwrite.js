import { Client, Databases, ID, Query } from "appwrite";
import fs from "fs";
import os from "os";
import path from "path";
import {
  APPWRITE_API_KEY,
  APPWRITE_DATABASE_ID,
  DOWNLOAD_WINDOW_SECONDS,
  HALLTICKET_PREPARE_SECONDS,
  APPWRITE_ENDPOINT,
  APPWRITE_HALLTICKETS_COLLECTION_ID,
  APPWRITE_PROJECT_ID,
  APPWRITE_USERS_COLLECTION_ID,
  APPWRITE_CONFIG_COLLECTION_ID,
  QUEUE_RATE_LIMIT_PER_SECOND,
} from "./config.js";
import {
  createMockUser,
  findMockUser,
  getMockDashboardInfo,
  getMockHallticket,
  getMockHallticketStatusMap,
  getMockStudentHallticketData,
  hasMockIdentifier,
  listMockStudents,
  markMockHallticketDownloaded,
} from "./mockStore.js";

const queueConfigState = globalThis.__QUEUE_CONFIG_STATE__ || {
  queueLimit: Math.max(Number(QUEUE_RATE_LIMIT_PER_SECOND) || 1, 1),
};

globalThis.__QUEUE_CONFIG_STATE__ = queueConfigState;

const RUNTIME_CONFIG_FILE = path.join(os.tmpdir(), "queue_sys_runtime_config.json");

function syncQueueConfigFromDisk() {
  try {
    if (!fs.existsSync(RUNTIME_CONFIG_FILE)) return;

    const raw = fs.readFileSync(RUNTIME_CONFIG_FILE, "utf8");
    if (!raw) return;

    const parsed = JSON.parse(raw);
    const limit = Number(parsed.queueLimit);
    if (Number.isFinite(limit) && limit >= 1) {
      queueConfigState.queueLimit = Math.floor(limit);
    }
  } catch {
    // Ignore runtime config read failures.
  }
}

function persistQueueConfigToDisk() {
  try {
    fs.writeFileSync(
      RUNTIME_CONFIG_FILE,
      JSON.stringify({ queueLimit: queueConfigState.queueLimit }),
      "utf8",
    );
  } catch {
    // Ignore runtime config write failures.
  }
}

export function getQueueLimitRuntime() {
  syncQueueConfigFromDisk();
  return Math.max(Number(queueConfigState.queueLimit) || 1, 1);
}

function hasAppwriteConfig() {
  return Boolean(
    APPWRITE_ENDPOINT &&
      APPWRITE_PROJECT_ID &&
      APPWRITE_API_KEY &&
      APPWRITE_DATABASE_ID &&
      APPWRITE_USERS_COLLECTION_ID,
  );
}

function hasAnyAppwriteConfig() {
  return Boolean(
    APPWRITE_ENDPOINT ||
      APPWRITE_PROJECT_ID ||
      APPWRITE_API_KEY ||
      APPWRITE_DATABASE_ID ||
      APPWRITE_USERS_COLLECTION_ID ||
      APPWRITE_HALLTICKETS_COLLECTION_ID,
  );
}

function isHallticketConfigPresent() {
  return Boolean(APPWRITE_HALLTICKETS_COLLECTION_ID && APPWRITE_CONFIG_COLLECTION_ID);
}

function ensureUsersDataMode() {
  if (hasAppwriteConfig()) return "appwrite";
  if (hasAnyAppwriteConfig()) {
    throw new Error(
      "Incomplete Appwrite config. Set APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID and APPWRITE_USERS_COLLECTION_ID",
    );
  }
  return "mock";
}

function createDatabasesClient() {
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

  if (typeof client.setDevKey === "function") {
    client.setDevKey(APPWRITE_API_KEY);
  } else if (typeof client.setKey === "function") {
    client.setKey(APPWRITE_API_KEY);
  } else {
    throw new Error("Unsupported Appwrite SDK: no API key setter found");
  }

  return new Databases(client);
}

export async function authenticateUser(role, identifier, password) {
  const mode = ensureUsersDataMode();
  if (mode === "mock") {
    const mockUser = findMockUser(role, identifier, password);
    if (!mockUser) return null;

    return {
      userId: mockUser.userId,
      role: mockUser.role,
      identifier: mockUser.role === "student" ? mockUser.rollNumber : mockUser.facultyId,
      rollNumber: mockUser.rollNumber,
      facultyId: mockUser.facultyId,
      name: mockUser.name,
    };
  }

  const idField = role === "student" ? "rollNumber" : "facultyId";
  const databases = createDatabasesClient();
  const response = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_USERS_COLLECTION_ID,
    [
      Query.equal("role", role),
      Query.equal(idField, identifier),
      Query.equal("password", password),
      Query.limit(1),
    ],
  );

  if (!response.documents.length) return null;
  const user = response.documents[0];

  return {
    userId: user.userId || user.$id,
    role: user.role,
    identifier: role === "student" ? user.rollNumber : user.facultyId,
    rollNumber: user.rollNumber,
    facultyId: user.facultyId,
    name: user.name,
  };
}

export async function createUser(input) {
  const mode = ensureUsersDataMode();
  if (mode === "mock") {
    if (hasMockIdentifier(input.role, input.identifier)) {
      throw new Error("Identifier already exists");
    }

    const mockUser = createMockUser(input);
    return {
      userId: mockUser.userId,
      role: mockUser.role,
      identifier: mockUser.role === "student" ? mockUser.rollNumber : mockUser.facultyId,
      name: mockUser.name,
    };
  }

  const databases = createDatabasesClient();
  const idField = input.role === "student" ? "rollNumber" : "facultyId";
  const duplicate = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_USERS_COLLECTION_ID,
    [Query.equal("role", input.role), Query.equal(idField, input.identifier), Query.limit(1)],
  );

  if (duplicate.documents.length) {
    throw new Error("Identifier already exists");
  }

  const userId = `${input.role === "student" ? "u" : "f"}-${ID.unique()}`;
  const documentData = {
    userId,
    role: input.role,
    password: input.password,
    name: input.name,
    rollNumber: input.role === "student" ? input.identifier : "",
    facultyId: input.role === "faculty" ? input.identifier : "",
    course: input.role === "student" ? input.course : "",
    semester: input.role === "student" ? Number(input.semester) : 0,
    examDate: input.role === "student" ? input.examDate : "",
    center: input.role === "student" ? input.center : "",
    department: input.role === "faculty" ? input.department : "",
    designation: input.role === "faculty" ? input.designation : "",
  };

  await databases.createDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_USERS_COLLECTION_ID,
    ID.unique(),
    documentData,
  );

  return {
    userId,
    role: input.role,
    identifier: input.identifier,
    name: input.name,
  };
}

export async function getDashboardInfo(userId) {
  const mode = ensureUsersDataMode();
  if (mode === "mock") {
    return getMockDashboardInfo(userId);
  }

  const databases = createDatabasesClient();
  const response = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_USERS_COLLECTION_ID,
    [Query.equal("userId", userId), Query.limit(1)],
  );

  if (!response.documents.length) return null;
  const user = response.documents[0];

  if (user.role === "faculty") {
    return {
      role: "faculty",
      department: user.department,
      designation: user.designation,
    };
  }

  return {
    role: "student",
    course: user.course,
    semester: user.semester,
    examDate: user.examDate,
    center: user.center,
  };
}

export async function getHallticket(userId) {
  const mode = ensureUsersDataMode();
  if (mode === "mock") {
    return getMockHallticket(userId);
  }

  if (!isHallticketConfigPresent()) {
    throw new Error(
      "Missing APPWRITE_HALLTICKETS_COLLECTION_ID. Configure it to read hall tickets from Appwrite",
    );
  }

  const databases = createDatabasesClient();
  const response = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_HALLTICKETS_COLLECTION_ID,
    [Query.equal("userId", userId), Query.limit(1)],
  );

  if (!response.documents.length) return null;
  const hallticket = response.documents[0];

  return {
    documentId: hallticket.$id,
    hallticketId: hallticket.hallticketId || hallticket.$id,
    examName: hallticket.examName,
    pdfUrl: hallticket.pdfUrl,
    isDownloaded: Boolean(hallticket.isDownloaded),
    status: hallticket.status,
    queuePosition: hallticket.queuePosition
  };
}

export async function getQueueConfig() {
  syncQueueConfigFromDisk();

  try {
    const mode = ensureUsersDataMode();
    if (mode === "mock") {
      return { queueLimit: queueConfigState.queueLimit };
    }

    if (!isHallticketConfigPresent()) {
      return { queueLimit: queueConfigState.queueLimit };
    }

    const databases = createDatabasesClient();
    const response = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_CONFIG_COLLECTION_ID,
      [Query.limit(1)],
    );

    if (!response.documents.length) {
      return { queueLimit: queueConfigState.queueLimit };
    }

    const limit = Number(response.documents[0].queueLimit) || queueConfigState.queueLimit;
    queueConfigState.queueLimit = limit;
    persistQueueConfigToDisk();

    return { queueLimit: limit, docId: response.documents[0].$id };
  } catch {
    persistQueueConfigToDisk();
    return { queueLimit: queueConfigState.queueLimit };
  }
}

export async function setQueueConfig(limit) {
  const normalizedLimit = Number(limit);
  queueConfigState.queueLimit = Math.max(Math.floor(normalizedLimit), 1);
  persistQueueConfigToDisk();

  try {
    const mode = ensureUsersDataMode();
    if (mode === "mock") return { queueLimit: queueConfigState.queueLimit };

    if (!isHallticketConfigPresent()) return { queueLimit: queueConfigState.queueLimit };

    const databases = createDatabasesClient();
    const response = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_CONFIG_COLLECTION_ID,
      [Query.limit(1)],
    );

    if (!response.documents.length) {
      await databases.createDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_CONFIG_COLLECTION_ID,
        ID.unique(),
        { queueLimit: queueConfigState.queueLimit },
      );
    } else {
      await databases.updateDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_CONFIG_COLLECTION_ID,
        response.documents[0].$id,
        { queueLimit: queueConfigState.queueLimit },
      );
    }

    return { queueLimit: queueConfigState.queueLimit };
  } catch {
    return { queueLimit: queueConfigState.queueLimit };
  }
}

export async function getActiveQueueCount() {
  const mode = ensureUsersDataMode();
  if (mode === "mock") return 0;
  
  const databases = createDatabasesClient();
  const response = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_HALLTICKETS_COLLECTION_ID,
    [Query.equal("status", "ACTIVE")]
  );
  return response.total;
}

export async function updateHallticketQueueStatus(docId, status, queuePosition = 0, extraData = {}) {
  const databases = createDatabasesClient();
  return databases.updateDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_HALLTICKETS_COLLECTION_ID,
    docId,
    { status, queuePosition, ...extraData },
  );
}

export async function getStudentHallticketData(userId) {
  const mode = ensureUsersDataMode();
  if (mode === "mock") {
    return getMockStudentHallticketData(userId);
  }

  const databases = createDatabasesClient();
  const response = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_USERS_COLLECTION_ID,
    [Query.equal("userId", userId), Query.equal("role", "student"), Query.limit(1)],
  );

  if (!response.documents.length) return null;
  const user = response.documents[0];

  return {
    name: user.name,
    rollNumber: user.rollNumber,
    course: user.course,
    semester: Number(user.semester),
    examDate: user.examDate,
    center: user.center,
  };
}

export async function markHallticketDownloaded(userId) {
  const mode = ensureUsersDataMode();
  if (mode === "mock") {
    return markMockHallticketDownloaded(userId);
  }

  if (!isHallticketConfigPresent()) {
    throw new Error(
      "Missing APPWRITE_HALLTICKETS_COLLECTION_ID. Configure it to update hall ticket download status",
    );
  }

  const databases = createDatabasesClient();
  const existing = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_HALLTICKETS_COLLECTION_ID,
    [Query.equal("userId", userId), Query.limit(1)],
  );

  if (!existing.documents.length) return null;
  const document = existing.documents[0];
  return databases.updateDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_HALLTICKETS_COLLECTION_ID,
    document.$id,
    {
      isDownloaded: true,
      status: "DOWNLOADED",
      queuePosition: 0,
    },
  );
}

export async function listStudentsForMonitor() {
  const mode = ensureUsersDataMode();
  if (mode === "mock") {
    return listMockStudents();
  }

  const databases = createDatabasesClient();
  const response = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_USERS_COLLECTION_ID,
    [Query.equal("role", "student"), Query.limit(1000)],
  );

  return response.documents.map((user) => ({
    userId: user.userId || user.$id,
    name: user.name,
    rollNumber: user.rollNumber,
    course: user.course,
    semester: Number(user.semester),
    examDate: user.examDate,
    center: user.center,
  }));
}

export async function getHallticketStatusMap() {
  const mode = ensureUsersDataMode();
  if (mode === "mock") {
    return getMockHallticketStatusMap();
  }

  if (!isHallticketConfigPresent()) {
    throw new Error(
      "Missing APPWRITE_HALLTICKETS_COLLECTION_ID. Configure it to read hall ticket monitor status",
    );
  }

  const databases = createDatabasesClient();
  const response = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_HALLTICKETS_COLLECTION_ID,
    [Query.limit(1000)],
  );

  const statusMap = new Map();
  response.documents.forEach((doc) => {
    statusMap.set(doc.userId, {
      isDownloaded: Boolean(doc.isDownloaded),
      status: doc.status || "IDLE",
      queuePosition: Number(doc.queuePosition) || 0,
      examName: doc.examName || "Final Semester Examination 2026",
      hallticketId: doc.hallticketId || doc.$id,
    });
  });

  return statusMap;
}

export async function ensurePersistentHallticket(userId) {
  const mode = ensureUsersDataMode();
  if (mode === "mock") {
    return getMockHallticket(userId);
  }

  if (!isHallticketConfigPresent()) {
    return null;
  }

  const existing = await getHallticket(userId);
  if (existing) {
    return existing;
  }

  const databases = createDatabasesClient();
  const hallticketId = `ht-${ID.unique()}`;
  const created = await databases.createDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_HALLTICKETS_COLLECTION_ID,
    ID.unique(),
    {
      userId,
      hallticketId,
      examName: "Final Semester Examination 2026",
      pdfUrl: "",
      isDownloaded: false,
      status: "IDLE",
      queuePosition: 0,
    },
  );

  return {
    documentId: created.$id,
    hallticketId: created.hallticketId || created.$id,
    examName: created.examName,
    pdfUrl: created.pdfUrl,
    isDownloaded: Boolean(created.isDownloaded),
    status: created.status,
    queuePosition: Number(created.queuePosition) || 0,
  };
}

export async function processPersistentHallticketQueue() {
  const mode = ensureUsersDataMode();
  if (mode === "mock" || !isHallticketConfigPresent()) {
    return;
  }

  const databases = createDatabasesClient();
  const now = Date.now();
  const prepareMs = HALLTICKET_PREPARE_SECONDS * 1000;
  const { queueLimit } = await getQueueConfig();
  const normalizedLimit = Math.max(Number(queueLimit) || 1, 1);

  const readyResponse = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_HALLTICKETS_COLLECTION_ID,
    [Query.equal("status", "READY"), Query.equal("isDownloaded", false), Query.limit(1000)],
  );

  const pendingResponse = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_HALLTICKETS_COLLECTION_ID,
    [Query.equal("status", "PENDING"), Query.orderAsc("queuePosition"), Query.limit(1000)],
  );

  const availableSlots = Math.max(normalizedLimit - readyResponse.total, 0);
  if (availableSlots <= 0) {
    return;
  }

  const eligible = pendingResponse.documents.filter((doc) => {
    const requestedAt = Number(doc.queuePosition) || 0;
    return requestedAt > 0 && now - requestedAt >= prepareMs;
  });

  const toPromote = eligible.slice(0, availableSlots);
  await Promise.all(
    toPromote.map((doc) =>
      databases.updateDocument(
        APPWRITE_DATABASE_ID,
        APPWRITE_HALLTICKETS_COLLECTION_ID,
        doc.$id,
        {
          status: "READY",
        },
      ),
    ),
  );
}

export async function getPersistentQueueStatus(userId) {
  const mode = ensureUsersDataMode();
  if (mode === "mock") {
    return { status: "idle", waitMessage: "No active request. Click generate hall ticket." };
  }

  if (!isHallticketConfigPresent()) {
    return { status: "idle", waitMessage: "Queue collection is not configured." };
  }

  await processPersistentHallticketQueue();

  const hallticket = await getHallticket(userId);
  if (!hallticket) {
    return { status: "idle", waitMessage: "No active request. Click generate hall ticket." };
  }

  if (hallticket.isDownloaded || hallticket.status === "DOWNLOADED") {
    return {
      status: "downloaded",
      hallticket,
      waitMessage: "Hall ticket already downloaded.",
    };
  }

  if (hallticket.status === "READY") {
    return {
      status: "ready",
      hallticket,
      waitMessage: "Your hall ticket is ready for download.",
    };
  }

  if (hallticket.status === "PENDING") {
    const databases = createDatabasesClient();
    const pendingResponse = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      APPWRITE_HALLTICKETS_COLLECTION_ID,
      [Query.equal("status", "PENDING"), Query.orderAsc("queuePosition"), Query.limit(1000)],
    );

    const queue = pendingResponse.documents;
    const index = queue.findIndex((doc) => doc.userId === userId);
    const position = index >= 0 ? index + 1 : 1;
    const aheadCount = Math.max(position - 1, 0);
    const requestedAt = Number(hallticket.queuePosition) || Date.now();
    const prepareMs = HALLTICKET_PREPARE_SECONDS * 1000;
    const preparationWaitSeconds = Math.max(Math.ceil((requestedAt + prepareMs - Date.now()) / 1000), 0);
    const { queueLimit } = await getQueueConfig();
    const processingRatePerSecond = Math.max(Number(queueLimit) || 1, 1);
    const throughputWaitSeconds = Math.ceil(position / processingRatePerSecond);
    const estimatedWaitSeconds = Math.max(preparationWaitSeconds, throughputWaitSeconds);

    return {
      status: "queued",
      position,
      aheadCount,
      queueLength: queue.length,
      processingRatePerSecond,
      preparationWaitSeconds,
      estimatedWaitSeconds,
      nextTurnAt: Date.now() + estimatedWaitSeconds * 1000,
      hallticket,
      waitMessage: "Server is busy. Please wait in the virtual queue.",
    };
  }

  return {
    status: "idle",
    waitMessage: "No active request. Click generate hall ticket.",
  };
}
