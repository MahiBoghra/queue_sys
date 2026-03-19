const loginScreen = document.getElementById("login-screen");
const dashboardScreen = document.getElementById("dashboard-screen");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const loginMessage = document.getElementById("login-message");
const loginTab = document.getElementById("login-tab");
const signupTab = document.getElementById("signup-tab");
const signupRole = document.getElementById("signup-role");
const studentSignupFields = document.getElementById("student-signup-fields");
const facultySignupFields = document.getElementById("faculty-signup-fields");
const requestBtn = document.getElementById("request-btn");
const statusText = document.getElementById("status-text");
const queuePosition = document.getElementById("queue-position");
const downloadBox = document.getElementById("download-box");
const downloadJsonBtn = document.getElementById("download-json-btn");
const hallticketExam = document.getElementById("hallticket-exam");
const logoutBtn = document.getElementById("logout-btn");
const sessionTimer = document.getElementById("session-timer");
const studentGrid = document.getElementById("student-grid");
const facultyGrid = document.getElementById("faculty-grid");
const studentActions = document.getElementById("student-actions");
const department = document.getElementById("department");
const designation = document.getElementById("designation");
const facultyMonitorBox = document.getElementById("faculty-monitor-box");
const refreshMonitorBtn = document.getElementById("refresh-monitor-btn");
const monitorTbody = document.getElementById("monitor-tbody");
const monitorMeta = document.getElementById("monitor-meta");

let pollTimer = null;
let sessionExpiresAt = null;
let sessionCountdown = null;
let currentRole = "student";

function showLoginMode() {
  loginTab.classList.add("active");
  signupTab.classList.remove("active");
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  loginMessage.textContent = "";
}

function showSignupMode() {
  signupTab.classList.add("active");
  loginTab.classList.remove("active");
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  loginMessage.textContent = "";
}

function updateSignupFieldsByRole() {
  const role = signupRole.value === "faculty" ? "faculty" : "student";
  const showStudent = role === "student";

  studentSignupFields.classList.toggle("hidden", !showStudent);
  facultySignupFields.classList.toggle("hidden", showStudent);

  studentSignupFields.querySelectorAll("input").forEach((input) => {
    input.required = showStudent;
  });
  facultySignupFields.querySelectorAll("input").forEach((input) => {
    input.required = !showStudent;
  });
}

function setStatus(message, position = null) {
  statusText.textContent = message;
  queuePosition.textContent = position ? `Queue Position: ${position}` : "";
}

function showDownload(hallticket) {
  if (!hallticket) return;
  hallticketExam.textContent = hallticket.examName;
  downloadBox.classList.remove("hidden");
}

function hideDownload() {
  downloadBox.classList.add("hidden");
}

function triggerJsonDownload(data, fileName) {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

function renderMonitorRows(rows) {
  monitorTbody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    const statusClass = row.isDownloaded ? "badge-success" : "badge-pending";
    const downloadedLabel = row.isDownloaded ? "Yes" : "No";

    tr.innerHTML = `
      <td>${row.name}</td>
      <td>${row.rollNumber}</td>
      <td>${row.status}</td>
      <td>${row.queuePosition}</td>
      <td><span class="badge ${statusClass}">${downloadedLabel}</span></td>
    `;

    monitorTbody.appendChild(tr);
  });
}

async function refreshFacultyMonitor() {
  try {
    const monitorData = await api("/api/faculty/queue-monitor", { method: "GET" });
    monitorMeta.textContent = `Queue length: ${monitorData.queueLength} | Refreshed: ${new Date(monitorData.refreshedAt).toLocaleTimeString()}`;
    renderMonitorRows(monitorData.rows || []);
  } catch (error) {
    monitorMeta.textContent = error.message;
  }
}

function switchToDashboard(data) {
  loginScreen.classList.add("hidden");
  dashboardScreen.classList.remove("hidden");
  currentRole = data.user.role || "student";

  document.getElementById("welcome-text").textContent = `Welcome, ${data.user.name}`;

  if (currentRole === "faculty") {
    studentGrid.classList.add("hidden");
    studentActions.classList.add("hidden");
    facultyGrid.classList.remove("hidden");
    facultyMonitorBox.classList.remove("hidden");
    department.textContent = data.dashboardInfo.department || "N/A";
    designation.textContent = data.dashboardInfo.designation || "N/A";
    setStatus("Faculty account logged in. Queue and hall ticket download are for students.");
    hideDownload();
    refreshFacultyMonitor();
  } else {
    facultyMonitorBox.classList.add("hidden");
    facultyGrid.classList.add("hidden");
    studentGrid.classList.remove("hidden");
    studentActions.classList.remove("hidden");
    document.getElementById("course").textContent = data.dashboardInfo.course;
    document.getElementById("semester").textContent = data.dashboardInfo.semester;
    document.getElementById("examDate").textContent = data.dashboardInfo.examDate;
    document.getElementById("center").textContent = data.dashboardInfo.center;
    setStatus("No active request yet.");
  }

  sessionExpiresAt = data.sessionExpiresAt;
  startSessionCountdown();
}

function switchToLogin() {
  loginScreen.classList.remove("hidden");
  dashboardScreen.classList.add("hidden");
  showLoginMode();
  hideDownload();
  setStatus("No active request yet.");
  clearInterval(sessionCountdown);
  clearInterval(pollTimer);
  pollTimer = null;
}

function startSessionCountdown() {
  clearInterval(sessionCountdown);

  const tick = () => {
    if (!sessionExpiresAt) return;

    const remainingMs = Number(sessionExpiresAt) - Date.now();
    if (remainingMs <= 0) {
      sessionTimer.textContent = "Session expired";
      switchToLogin();
      return;
    }

    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    sessionTimer.textContent = `Auto logout in ${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  tick();
  sessionCountdown = setInterval(tick, 1000);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include",
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

async function checkSession() {
  try {
    const data = await api("/api/auth/me", { method: "GET" });
    switchToDashboard(data);
  } catch {
    switchToLogin();
  }
}

async function pollQueueStatus() {
  try {
    const data = await api("/api/hallticket/status", { method: "GET" });

    if (data.status === "ready") {
      setStatus(data.waitMessage || "Hall ticket ready");
      showDownload(data.hallticket);
      clearInterval(pollTimer);
      pollTimer = null;
      return;
    }

    if (data.status === "queued") {
      hideDownload();
      setStatus(data.waitMessage, data.position);
      return;
    }

    hideDownload();
    setStatus(data.waitMessage || "No active request.");
  } catch (error) {
    setStatus(error.message);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";

  const formData = new FormData(loginForm);
  const role = formData.get("role");
  const identifier = formData.get("identifier");
  const password = formData.get("password");

  try {
    await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ role, identifier, password }),
    });

    loginForm.reset();
    await checkSession();
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";

  const formData = new FormData(signupForm);
  const payload = {
    role: formData.get("role"),
    name: formData.get("name"),
    identifier: formData.get("identifier"),
    password: formData.get("password"),
    course: formData.get("course"),
    semester: formData.get("semester"),
    examDate: formData.get("examDate"),
    center: formData.get("center"),
    department: formData.get("department"),
    designation: formData.get("designation"),
  };

  try {
    await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    signupForm.reset();
    updateSignupFieldsByRole();
    showLoginMode();
    loginMessage.textContent = "Signup successful. Please login.";
  } catch (error) {
    loginMessage.textContent = error.message;
  }
});

requestBtn.addEventListener("click", async () => {
  if (currentRole !== "student") {
    setStatus("Faculty account is not eligible for hall ticket queue.");
    return;
  }

  try {
    const data = await api("/api/hallticket/request", { method: "POST", body: "{}" });

    if (data.status === "ready") {
      setStatus(data.waitMessage || "Hall ticket ready.");
      showDownload(data.hallticket);
      return;
    }

    hideDownload();
    setStatus(data.waitMessage, data.position);

    if (!pollTimer) {
      pollTimer = setInterval(pollQueueStatus, 2000);
    }
  } catch (error) {
    setStatus(error.message);
  }
});

downloadJsonBtn.addEventListener("click", async () => {
  try {
    const payload = await api("/api/hallticket/download-json", { method: "GET" });
    triggerJsonDownload(payload.hallticketData, payload.downloadFileName);

    await api("/api/hallticket/mark-downloaded", {
      method: "POST",
      body: JSON.stringify({}),
    });

    setStatus("Hall ticket JSON downloaded and marked as completed.");
  } catch (error) {
    setStatus(error.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
  } finally {
    switchToLogin();
  }
});

loginTab.addEventListener("click", showLoginMode);
signupTab.addEventListener("click", showSignupMode);
signupRole.addEventListener("change", updateSignupFieldsByRole);
refreshMonitorBtn.addEventListener("click", refreshFacultyMonitor);

updateSignupFieldsByRole();
showLoginMode();
checkSession();
