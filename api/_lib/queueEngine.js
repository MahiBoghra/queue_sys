import { DOWNLOAD_WINDOW_SECONDS, QUEUE_RATE_LIMIT_PER_SECOND } from "./config.js";
import fs from "fs";
import os from "os";
import path from "path";

const STATE_FILE = path.join(os.tmpdir(), "queue_sys_state.json");

function createDefaultState() {
  return {
    secondWindow: 0,
    processedCount: 0,
    queue: [],
    jobByUserId: new Map(),
  };
}

function serializeState(state) {
  const jobs = {};
  state.jobByUserId.forEach((job, userId) => {
    jobs[userId] = job;
  });

  return {
    secondWindow: Number(state.secondWindow) || 0,
    processedCount: Number(state.processedCount) || 0,
    queue: Array.isArray(state.queue) ? state.queue : [],
    jobs,
  };
}

function hydrateState(raw) {
  const state = createDefaultState();
  if (!raw || typeof raw !== "object") return state;

  state.secondWindow = Number(raw.secondWindow) || 0;
  state.processedCount = Number(raw.processedCount) || 0;
  state.queue = Array.isArray(raw.queue) ? raw.queue : [];

  const jobs = raw.jobs && typeof raw.jobs === "object" ? raw.jobs : {};
  state.jobByUserId = new Map(Object.entries(jobs));
  return state;
}

function readStateFromDisk() {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    if (!raw) return null;
    return hydrateState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStateToDisk(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(serializeState(state)), "utf8");
  } catch {
    // Keep queue operations functional even if disk persistence is unavailable.
  }
}

const globalState = globalThis.__QUEUE_STATE__ || {
  secondWindow: 0,
  processedCount: 0,
  queue: [],
  jobByUserId: new Map(),
};

globalThis.__QUEUE_STATE__ = globalState;

function syncStateFromDisk() {
  const diskState = readStateFromDisk();
  if (!diskState) return;

  globalState.secondWindow = diskState.secondWindow;
  globalState.processedCount = diskState.processedCount;
  globalState.queue = diskState.queue;
  globalState.jobByUserId = diskState.jobByUserId;
}

function persistState() {
  writeStateToDisk(globalState);
}

function getNowSecond() {
  return Math.floor(Date.now() / 1000);
}

function rotateWindowIfNeeded() {
  const now = getNowSecond();
  if (globalState.secondWindow !== now) {
    globalState.secondWindow = now;
    globalState.processedCount = 0;
  }
}

function markReady(userId, hallticket) {
  const expiresAt = Date.now() + DOWNLOAD_WINDOW_SECONDS * 1000;
  const current = globalState.jobByUserId.get(userId) || {};

  globalState.jobByUserId.set(userId, {
    ...current,
    userId,
    status: "ready",
    readyAt: Date.now(),
    expiresAt,
    hallticket,
  });
}

function processQueue() {
  rotateWindowIfNeeded();

  while (
    globalState.queue.length > 0 &&
    globalState.processedCount < QUEUE_RATE_LIMIT_PER_SECOND
  ) {
    const queuedUserId = globalState.queue.shift();
    const job = globalState.jobByUserId.get(queuedUserId);
    if (!job || !job.hallticket) continue;

    globalState.processedCount += 1;
    markReady(queuedUserId, job.hallticket);
  }
}

function buildQueuedMetrics(position) {
  const safePosition = Math.max(Number(position) || 0, 0);
  const safeRate = Math.max(QUEUE_RATE_LIMIT_PER_SECOND, 1);
  const aheadCount = Math.max(safePosition - 1, 0);
  const estimatedWaitSeconds = Math.ceil(safePosition / safeRate);
  const nextTurnAt = Date.now() + estimatedWaitSeconds * 1000;

  return {
    position: safePosition,
    aheadCount,
    queueLength: globalState.queue.length,
    processingRatePerSecond: safeRate,
    estimatedWaitSeconds,
    nextTurnAt,
  };
}

export function requestSlot(userId, hallticket) {
  syncStateFromDisk();
  processQueue();

  const existing = globalState.jobByUserId.get(userId);

  if (existing?.status === "ready") {
    if (Date.now() > existing.expiresAt) {
      globalState.jobByUserId.delete(userId);
      persistState();
    } else {
      persistState();
      return {
        status: "ready",
        waitMessage: "Your hall ticket is ready for download.",
        hallticket: existing.hallticket,
        expiresAt: existing.expiresAt,
      };
    }
  }

  if (existing?.status === "queued") {
    const position = globalState.queue.indexOf(userId) + 1;
    const metrics = buildQueuedMetrics(position);
    persistState();
    return {
      status: "queued",
      ...metrics,
      waitMessage: "Server is busy. Please wait in the virtual queue.",
    };
  }

  rotateWindowIfNeeded();

  if (globalState.processedCount < QUEUE_RATE_LIMIT_PER_SECOND) {
    globalState.processedCount += 1;
    markReady(userId, hallticket);

    const job = globalState.jobByUserId.get(userId);
    persistState();
    return {
      status: "ready",
      waitMessage: "Your hall ticket is ready for download.",
      hallticket,
      expiresAt: job.expiresAt,
    };
  }

  globalState.queue.push(userId);
  globalState.jobByUserId.set(userId, {
    userId,
    status: "queued",
    enqueuedAt: Date.now(),
    hallticket,
  });

  const metrics = buildQueuedMetrics(globalState.queue.length);
  persistState();

  return {
    status: "queued",
    ...metrics,
    waitMessage: "Server is busy. Please wait in the virtual queue.",
  };
}

export function getStatus(userId) {
  syncStateFromDisk();
  processQueue();

  const job = globalState.jobByUserId.get(userId);
  if (!job) {
    persistState();
    return {
      status: "idle",
      waitMessage: "No active request. Click generate hall ticket.",
    };
  }

  if (job.status === "ready") {
    if (Date.now() > job.expiresAt) {
      globalState.jobByUserId.delete(userId);
      persistState();
      return {
        status: "expired",
        waitMessage: "Download window expired. Request again.",
      };
    }

    persistState();
    return {
      status: "ready",
      hallticket: job.hallticket,
      expiresAt: job.expiresAt,
      expiresInSeconds: Math.max(Math.ceil((job.expiresAt - Date.now()) / 1000), 0),
      waitMessage: "Your hall ticket is ready for download.",
    };
  }

  const position = globalState.queue.indexOf(userId) + 1;
  const metrics = buildQueuedMetrics(position);
  persistState();
  return {
    status: "queued",
    ...metrics,
    waitMessage: "Server is busy. Please wait in the virtual queue.",
  };
}

export function getQueueSnapshot() {
  syncStateFromDisk();
  processQueue();

  const snapshot = {
    queue: [...globalState.queue],
    jobs: {},
  };

  globalState.jobByUserId.forEach((job, userId) => {
    snapshot.jobs[userId] = {
      status: job.status,
      expiresAt: job.expiresAt || null,
    };
  });

  persistState();

  return snapshot;
}

export function getQueueMetaForUser(userId) {
  syncStateFromDisk();
  processQueue();

  const job = globalState.jobByUserId.get(userId);
  if (!job) {
    persistState();
    return { status: "idle", queuePosition: 0 };
  }

  if (job.status === "queued") {
    persistState();
    return {
      status: "waiting",
      queuePosition: Math.max(globalState.queue.indexOf(userId) + 1, 0),
    };
  }

  persistState();
  return { status: "ready", queuePosition: 0 };
}
