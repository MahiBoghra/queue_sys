/**
 * @file mockStore.js
 * @description In-memory mock data store used when no Appwrite environment
 *   variables are configured.  Provides the same interface as the Appwrite
 *   functions in appwrite.js so the app works end-to-end in development
 *   without any external services.
 *
 *   Pre-seeded users:
 *     Student  — roll: 2026CS001 / password: pass123
 *     Student  — roll: 2026CS002 / password: pass123
 *     Faculty  — id:   FAC1001   / password: pass123
 * @module _lib/mockStore
 */

// ---------------------------------------------------------------------------
// Seed data  (module-level — shared across all requests in the same process)
// ---------------------------------------------------------------------------

/** @type {Array<object>} */
const m_users = [
  {
    userId:      "u-1001",
    role:        "student",
    rollNumber:  "2026CS001",
    facultyId:   "",
    password:    "pass123",
    name:        "Aarav Sharma",
    course:      "B.Tech CSE",
    semester:    "8",
    examDate:    "2026-04-18",
    center:      "University Main Campus",
    department:  "",
    designation: "",
  },
  {
    userId:      "u-1002",
    role:        "student",
    rollNumber:  "2026CS002",
    facultyId:   "",
    password:    "pass123",
    name:        "Ishita Verma",
    course:      "B.Tech CSE",
    semester:    "8",
    examDate:    "2026-04-18",
    center:      "University Main Campus",
    department:  "",
    designation: "",
  },
  {
    userId:      "f-2001",
    role:        "faculty",
    rollNumber:  "",
    facultyId:   "FAC1001",
    password:    "pass123",
    name:        "Dr. Meera Nair",
    course:      "",
    semester:    "",
    examDate:    "",
    center:      "",
    department:  "Computer Science",
    designation: "Professor",
  },
];

/**
 * Hall ticket download-status records keyed by userId.
 * @type {Record<string, { hallticketId: string, examName: string, pdfUrl: string, isDownloaded: boolean }>}
 */
const m_halltickets = {
  "u-1001": {
    hallticketId: "ht-1001",
    examName:     "Final Semester Examination 2026",
    pdfUrl:       "https://example.com/hallticket/ht-1001.pdf",
    isDownloaded: false,
  },
  "u-1002": {
    hallticketId: "ht-1002",
    examName:     "Final Semester Examination 2026",
    pdfUrl:       "https://example.com/hallticket/ht-1002.pdf",
    isDownloaded: false,
  },
};

// ---------------------------------------------------------------------------
// Public API  (mirrors the Appwrite layer in appwrite.js)
// ---------------------------------------------------------------------------

/**
 * Find a user by role + identifier + password.
 * @param {string} role       - "student" | "faculty"
 * @param {string} identifier - Roll number or faculty ID.
 * @param {string} password
 * @returns {object|undefined}
 */
export function findMockUser(role, identifier, password) {
  return m_users.find(
    (u) =>
      u.role === role &&
      (role === "student" ? u.rollNumber === identifier : u.facultyId === identifier) &&
      u.password === password,
  );
}

/**
 * Return dashboard info for the given userId.
 * @param {string} userId
 * @returns {object|null}
 */
export function getMockDashboardInfo(userId) {
  const user = m_users.find((u) => u.userId === userId);
  if (!user) return null;

  if (user.role === "faculty") {
    return { role: "faculty", department: user.department, designation: user.designation };
  }

  return {
    role:     "student",
    course:   user.course,
    semester: user.semester,
    examDate: user.examDate,
    center:   user.center,
  };
}

/**
 * Return the hall ticket record for the given userId, or null.
 * @param {string} userId
 * @returns {object|null}
 */
export function getMockHallticket(userId) {
  return m_halltickets[userId] || null;
}

/**
 * Mark a user's hall ticket as downloaded.
 * @param {string} userId
 * @returns {object|null}
 */
export function markMockHallticketDownloaded(userId) {
  if (!m_halltickets[userId]) return null;
  m_halltickets[userId].isDownloaded = true;
  return m_halltickets[userId];
}

/**
 * Return full student data needed to render a hall ticket.
 * @param {string} userId
 * @returns {object|null}
 */
export function getMockStudentHallticketData(userId) {
  const user = m_users.find((u) => u.userId === userId && u.role === "student");
  if (!user) return null;

  return {
    name:       user.name,
    rollNumber: user.rollNumber,
    course:     user.course,
    semester:   Number(user.semester),
    examDate:   user.examDate,
    center:     user.center,
  };
}

/**
 * Return all students formatted for the faculty queue monitor.
 * @returns {Array<object>}
 */
export function listMockStudents() {
  return m_users
    .filter((u) => u.role === "student")
    .map((u) => ({
      userId:     u.userId,
      name:       u.name,
      rollNumber: u.rollNumber,
      course:     u.course,
      semester:   Number(u.semester),
      examDate:   u.examDate,
      center:     u.center,
    }));
}

/**
 * Return a Map of userId → { isDownloaded, hallticketId } for monitor display.
 * @returns {Map<string, { isDownloaded: boolean, hallticketId: string }>}
 */
export function getMockHallticketStatusMap() {
  const statusMap = new Map();
  Object.entries(m_halltickets).forEach(([userId, ht]) => {
    statusMap.set(userId, {
      isDownloaded: Boolean(ht.isDownloaded),
      hallticketId: ht.hallticketId,
    });
  });
  return statusMap;
}

/**
 * Check whether an identifier (roll number or faculty ID) is already registered.
 * @param {string} role
 * @param {string} identifier
 * @returns {boolean}
 */
export function hasMockIdentifier(role, identifier) {
  return m_users.some((u) => {
    if (u.role !== role) return false;
    return role === "student" ? u.rollNumber === identifier : u.facultyId === identifier;
  });
}

/**
 * Create and persist a new mock user, returning the created record.
 * @param {object} input
 * @returns {object}
 */
export function createMockUser(input) {
  const isStudent = input.role === "student";
  const userId    = `${isStudent ? "u" : "f"}-${Math.floor(Math.random() * 100000)}`;

  const newUser = {
    userId,
    role:        input.role,
    rollNumber:  isStudent ? input.identifier : "",
    facultyId:   isStudent ? ""               : input.identifier,
    password:    input.password,
    name:        input.name,
    course:      isStudent ? input.course      : "",
    semester:    isStudent ? input.semester    : "",
    examDate:    isStudent ? input.examDate    : "",
    center:      isStudent ? input.center      : "",
    department:  isStudent ? ""                : input.department,
    designation: isStudent ? ""                : input.designation,
  };

  m_users.push(newUser);
  return newUser;
}
