import { Client, Databases, ID, Query } from "appwrite";
import {
  APPWRITE_API_KEY,
  APPWRITE_DATABASE_ID,
  APPWRITE_ENDPOINT,
  APPWRITE_HALLTICKETS_COLLECTION_ID,
  APPWRITE_PROJECT_ID,
  APPWRITE_USERS_COLLECTION_ID,
  APPWRITE_CONFIG_COLLECTION_ID,
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
    hallticketId: hallticket.hallticketId || hallticket.$id,
    examName: hallticket.examName,
    pdfUrl: hallticket.pdfUrl,
    isDownloaded: Boolean(hallticket.isDownloaded),
    status: hallticket.status,
    queuePosition: hallticket.queuePosition
  };
}

export async function getQueueConfig() {
  const mode = ensureUsersDataMode();
  if (mode === "mock") return { queueLimit: 5 };

  if (!isHallticketConfigPresent()) return { queueLimit: 5 };

  const databases = createDatabasesClient();
  const response = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_CONFIG_COLLECTION_ID,
    [Query.limit(1)]
  );

  if (!response.documents.length) {
    // Return default if not found
    return { queueLimit: 5 };
  }
  return { queueLimit: response.documents[0].queueLimit || 5, docId: response.documents[0].$id };
}

export async function setQueueConfig(limit) {
  const mode = ensureUsersDataMode();
  if (mode === "mock") return { queueLimit: limit };

  if (!isHallticketConfigPresent()) return { queueLimit: limit };

  const databases = createDatabasesClient();
  const response = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    APPWRITE_CONFIG_COLLECTION_ID,
    [Query.limit(1)]
  );

  if (!response.documents.length) {
    await databases.createDocument(APPWRITE_DATABASE_ID, APPWRITE_CONFIG_COLLECTION_ID, ID.unique(), { queueLimit: limit });
  } else {
    await databases.updateDocument(APPWRITE_DATABASE_ID, APPWRITE_CONFIG_COLLECTION_ID, response.documents[0].$id, { queueLimit: limit });
  }
  return { queueLimit: limit };
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

export async function updateHallticketQueueStatus(docId, status, queuePosition = 0) {
  const databases = createDatabasesClient();
  return databases.updateDocument(
    APPWRITE_DATABASE_ID,
    APPWRITE_HALLTICKETS_COLLECTION_ID,
    docId,
    { status, queuePosition }
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
    { isDownloaded: true },
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
      hallticketId: doc.hallticketId || doc.$id,
    });
  });

  return statusMap;
}
