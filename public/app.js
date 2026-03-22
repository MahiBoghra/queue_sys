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
const queueDetails = document.getElementById("queue-details");
const downloadBox = document.getElementById("download-box");
const downloadJsonBtn = document.getElementById("download-json-btn");
const hallticketExam = document.getElementById("hallticket-exam");
const logoutBtn = document.getElementById("logout-btn");
const sessionTimer = document.getElementById("session-timer");
const studentGrid = document.getElementById("student-grid");
const facultyGrid = document.getElementById("faculty-grid");
const studentActions = document.getElementById("student-actions");
const hallticketPreview = document.getElementById("hallticket-preview");
const ticketStudentName = document.getElementById("ticket-student-name");
const ticketRollNumber = document.getElementById("ticket-roll-number");
const ticketDepartment = document.getElementById("ticket-department");
const department = document.getElementById("department");
const designation = document.getElementById("designation");
const facultyMonitorBox = document.getElementById("faculty-monitor-box");
const refreshMonitorBtn = document.getElementById("refresh-monitor-btn");
const monitorTbody = document.getElementById("monitor-tbody");
const monitorMeta = document.getElementById("monitor-meta");

const realtimeModal = document.getElementById("realtime-modal");
const modalName = document.getElementById("modal-name");
const modalExam = document.getElementById("modal-exam");
const modalTime = document.getElementById("modal-time");
const closeModalBtn = document.getElementById("close-modal-btn");

const facultyQueueLimit = document.getElementById("faculty-queue-limit");
const updateLimitBtn = document.getElementById("update-limit-btn");
const limitUpdateMsg = document.getElementById("limit-update-msg");

let appwriteClient = null;
let appwriteConfig = null;
let realtimeUnsubscribe = null;

let pollTimer = null;
let sessionExpiresAt = null;
let sessionCountdown = null;
let currentRole = "student";
let currentUserData = null;

async function initAppwrite() {
  if (appwriteClient) return;
  try {
    const config = await api("/api/hallticket/public-config", { method: "GET" });
    if (config.endpoint && config.projectId) {
      appwriteConfig = config;
      appwriteClient = new window.Appwrite.Client()
          .setEndpoint(config.endpoint)
          .setProject(config.projectId);
    }
  } catch (error) {
    console.error("Failed to init Appwrite", error);
  }
}


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

function formatDuration(seconds) {
  const value = Math.max(Number(seconds) || 0, 0);
  const mins = Math.floor(value / 60);
  const secs = value % 60;

  if (mins > 0) {
    return `${mins}m ${String(secs).padStart(2, "0")}s`;
  }

  return `${secs}s`;
}

function setStatus(message, queueMeta = null) {
  statusText.textContent = message;

  if (!queueMeta || queueMeta.status !== "queued") {
    queuePosition.textContent = "";
    queueDetails.textContent = "";
    return;
  }

  const position = Math.max(Number(queueMeta.position) || 0, 0);
  const aheadCount = Math.max(Number(queueMeta.aheadCount) || 0, 0);
  const queueLength = Math.max(Number(queueMeta.queueLength) || 0, 0);
  const estimatedWaitSeconds = Math.max(Number(queueMeta.estimatedWaitSeconds) || 0, 0);
  const nextTurnAt = queueMeta.nextTurnAt
    ? new Date(Number(queueMeta.nextTurnAt)).toLocaleTimeString()
    : "calculating...";

  queuePosition.textContent = position > 0
    ? `Queue number: ${position} (people ahead: ${aheadCount})`
    : "Queue number is being calculated...";

  queueDetails.textContent = `Total in queue: ${queueLength} | Estimated wait: ${formatDuration(estimatedWaitSeconds)} | Expected turn: ${nextTurnAt}`;
}

function stopQueuePolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

async function refreshQueueStatus() {
  if (currentRole !== "student") return;

  try {
    const data = await api("/api/hallticket/status", { method: "GET" });

    if (data.status === "ready") {
      stopQueuePolling();
      setStatus("Your turn has come. Hall ticket is ready for download.");
      showDownloadModal(data.hallticket || { examName: "Final Semester Examination 2026" });
      return;
    }

    if (data.status === "queued") {
      setStatus(data.waitMessage || "Please wait in queue.", data);
      return;
    }

    if (data.status === "expired") {
      stopQueuePolling();
      setStatus(data.waitMessage || "Download window expired. Request again.");
      return;
    }

    setStatus(data.waitMessage || "No active request yet.");
  } catch (error) {
    setStatus(error.message || "Unable to fetch queue status.");
  }
}

function startQueuePolling() {
  stopQueuePolling();
  refreshQueueStatus();
  pollTimer = setInterval(refreshQueueStatus, 3000);
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

function deriveDepartmentFromCourse(course) {
  if (!course) return "Computer Science";

  const normalized = String(course).trim();
  if (!normalized) return "Computer Science";

  if (normalized.includes(" ")) {
    return normalized;
  }

  if (normalized.toUpperCase().includes("CSE")) {
    return "Computer Science and Engineering";
  }

  return normalized;
}

function fillHallticketPreview(data) {
  ticketStudentName.textContent = data.user?.name || "N/A";
  ticketRollNumber.textContent = data.user?.rollNumber || data.user?.identifier || "N/A";
  ticketDepartment.textContent = deriveDepartmentFromCourse(data.dashboardInfo?.course);
}

async function refreshFacultyMonitor() {
  try {
    const monitorData = await api("/api/faculty/queue-monitor", { method: "GET" });
    const waitingCount = Number(monitorData.waitingCount ?? monitorData.queueLength ?? 0);
    const readyCount = Number(monitorData.readyCount ?? 0);
    const activeRequests = Number(monitorData.activeRequests ?? waitingCount + readyCount);
    monitorMeta.textContent = `Waiting: ${waitingCount} | Ready: ${readyCount} | Active requests: ${activeRequests} | Refreshed: ${new Date(monitorData.refreshedAt).toLocaleTimeString()}`;
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
    hallticketPreview.classList.add("hidden");
    facultyGrid.classList.remove("hidden");
    facultyMonitorBox.classList.remove("hidden");
    department.textContent = data.dashboardInfo.department || "N/A";
    designation.textContent = data.dashboardInfo.designation || "N/A";
    setStatus("Faculty account logged in. Queue and hall ticket download are for students.");
    hideDownload();
    fetchFacultyQueueLimit();
    refreshFacultyMonitor();
  } else {
    facultyMonitorBox.classList.add("hidden");
    facultyGrid.classList.add("hidden");
    studentGrid.classList.remove("hidden");
    studentActions.classList.remove("hidden");
    hallticketPreview.classList.remove("hidden");
    document.getElementById("course").textContent = data.dashboardInfo.course;
    document.getElementById("semester").textContent = data.dashboardInfo.semester;
    document.getElementById("examDate").textContent = data.dashboardInfo.examDate;
    document.getElementById("center").textContent = data.dashboardInfo.center;
    fillHallticketPreview(data);
    setStatus("No active request yet.");
    refreshQueueStatus();
    currentUserData = {
      name: data.user.name,
      ...data.dashboardInfo
    };
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
  stopQueuePolling();
  if (realtimeUnsubscribe) {
    realtimeUnsubscribe();
    realtimeUnsubscribe = null;
  }
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

async function fetchFacultyQueueLimit() {
  try {
    const config = await api("/api/faculty/config", { method: "GET" });
    facultyQueueLimit.value = config.queueLimit;
  } catch (e) {
    console.warn("Could not fetch queue limit", e);
  }
}

updateLimitBtn.addEventListener("click", async () => {
  try {
    const lim = parseInt(facultyQueueLimit.value, 10);
    if (!lim || lim < 1) return;
    limitUpdateMsg.textContent = "Updating...";
    await api("/api/faculty/config", { method: "POST", body: JSON.stringify({ queueLimit: lim }) });
    limitUpdateMsg.textContent = "Saved!";
    setTimeout(() => limitUpdateMsg.textContent = "", 2000);
  } catch (e) {
    limitUpdateMsg.textContent = "Error";
  }
});

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
      stopQueuePolling();
      setStatus(data.waitMessage || "Hall ticket ready.");
      showDownloadModal(data.hallticket);
      return;
    }

    hideDownload();
    setStatus(data.waitMessage, data);
    startQueuePolling();

    if (appwriteClient && appwriteConfig && data.docId) {
      if (realtimeUnsubscribe) realtimeUnsubscribe();
      
      const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.hallticketsCollectionId}.documents.${data.docId}`;
      setStatus(`Subscribed to Realtime Updates for document: ${data.docId}...`);
      
      realtimeUnsubscribe = appwriteClient.subscribe(channel, response => {
        if (response.events.includes("databases.*.collections.*.documents.*.update")) {
            const updated = response.payload;
            if (updated.status === "DONE" || updated.status === "READY") {
                stopQueuePolling();
                setStatus("Hall ticket ready.");
                showDownloadModal(updated);
                if (realtimeUnsubscribe) { realtimeUnsubscribe(); realtimeUnsubscribe = null; }
            } else {
                refreshQueueStatus();
            }
        }
      });
    } else {
      setStatus("Realtime not configured. Queue status will auto-refresh every 3 seconds.", data);
    }
  } catch (error) {
    setStatus(error.message);
  }
});

function showDownloadModal(hallticket) {
  realtimeModal.classList.remove("hidden");
  modalName.textContent = currentUserData?.name || "Student";
  modalExam.textContent = hallticket.examName || "Final Exams";
  modalTime.textContent = currentUserData?.examDate || "N/A";
  
  // also prepare the usual JSON box logic
  hallticketExam.textContent = hallticket.examName;
}

closeModalBtn.addEventListener("click", () => {
    realtimeModal.classList.add("hidden");
    downloadBox.classList.remove("hidden");
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
    stopQueuePolling();
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
initAppwrite().then(() => {
  checkSession();
});
