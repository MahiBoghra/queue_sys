const users = [
  {
    userId: "u-1001",
    role: "student",
    rollNumber: "2026CS001",
    facultyId: "",
    password: "pass123",
    name: "Aarav Sharma",
    course: "B.Tech CSE",
    semester: "8",
    examDate: "2026-04-18",
    center: "University Main Campus",
    department: "",
    designation: "",
  },
  {
    userId: "u-1002",
    role: "student",
    rollNumber: "2026CS002",
    facultyId: "",
    password: "pass123",
    name: "Ishita Verma",
    course: "B.Tech CSE",
    semester: "8",
    examDate: "2026-04-18",
    center: "University Main Campus",
    department: "",
    designation: "",
  },
  {
    userId: "f-2001",
    role: "faculty",
    rollNumber: "",
    facultyId: "FAC1001",
    password: "pass123",
    name: "Dr. Meera Nair",
    course: "",
    semester: "",
    examDate: "",
    center: "",
    department: "Computer Science",
    designation: "Professor",
  },
];

const halltickets = {
  "u-1001": {
    hallticketId: "ht-1001",
    examName: "Final Semester Examination 2026",
    pdfUrl: "https://example.com/hallticket/ht-1001.pdf",
  },
  "u-1002": {
    hallticketId: "ht-1002",
    examName: "Final Semester Examination 2026",
    pdfUrl: "https://example.com/hallticket/ht-1002.pdf",
  },
};

export function findMockUser(role, identifier, password) {
  return users.find(
    (item) =>
      item.role === role &&
      (role === "student" ? item.rollNumber === identifier : item.facultyId === identifier) &&
      item.password === password,
  );
}

export function getMockDashboardInfo(userId) {
  const user = users.find((item) => item.userId === userId);
  if (!user) return null;

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

export function getMockHallticket(userId) {
  return halltickets[userId] || null;
}

export function hasMockIdentifier(role, identifier) {
  return users.some((item) => {
    if (item.role !== role) return false;
    return role === "student" ? item.rollNumber === identifier : item.facultyId === identifier;
  });
}

export function createMockUser(input) {
  const isStudent = input.role === "student";
  const userId = `${isStudent ? "u" : "f"}-${Math.floor(Math.random() * 100000)}`;

  const user = {
    userId,
    role: input.role,
    rollNumber: isStudent ? input.identifier : "",
    facultyId: isStudent ? "" : input.identifier,
    password: input.password,
    name: input.name,
    course: isStudent ? input.course : "",
    semester: isStudent ? input.semester : "",
    examDate: isStudent ? input.examDate : "",
    center: isStudent ? input.center : "",
    department: isStudent ? "" : input.department,
    designation: isStudent ? "" : input.designation,
  };

  users.push(user);
  return user;
}
