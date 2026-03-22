import {
  DOWNLOAD_WINDOW_SECONDS,
  HALLTICKET_PREPARE_SECONDS,
} from "./config.js";
import { getQueueLimitRuntime } from "./appwrite.js";
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

function getProcessingRate() {
  return Math.max(Number(getQueueLimitRuntime()) || 1, 1);
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

export function markDownloaded(userId) {
  syncStateFromDisk();

  const current = globalState.jobByUserId.get(userId);
  if (!current) {
    persistState();
    return { status: "idle" };
  }

  globalState.queue = globalState.queue.filter((queuedUserId) => queuedUserId !== userId);
  globalState.jobByUserId.set(userId, {
    ...current,
    status: "downloaded",
    downloadedAt: Date.now(),
  });

  persistState();
  return { status: "downloaded" };
}

function processQueue() {
  rotateWindowIfNeeded();
  const processingRate = getProcessingRate();

  while (
    globalState.queue.length > 0 &&
    globalState.processedCount < processingRate
  ) {
    const queuedUserId = globalState.queue[0];
    const job = globalState.jobByUserId.get(queuedUserId);
    if (!job || !job.hallticket) continue;

    const eligibleAt = Number(job.eligibleAt) || 0;
    if (eligibleAt > Date.now()) {
      break;
    }

    globalState.queue.shift();

    globalState.processedCount += 1;
    markReady(queuedUserId, job.hallticket);
  }
}

function buildQueuedMetrics(position, eligibleAt = 0) {
  const safePosition = Math.max(Number(position) || 0, 0);
  const safeRate = getProcessingRate();
  const aheadCount = Math.max(safePosition - 1, 0);
  const throughputWaitSeconds = Math.ceil(safePosition / safeRate);
  const preparationWaitSeconds = Math.max(
    Math.ceil((Number(eligibleAt) - Date.now()) / 1000),
    0,
  );
  const estimatedWaitSeconds = Math.max(throughputWaitSeconds, preparationWaitSeconds);
  const nextTurnAt = Date.now() + estimatedWaitSeconds * 1000;

  return {
    position: safePosition,
    aheadCount,
    queueLength: globalState.queue.length,
    processingRatePerSecond: safeRate,
    preparationWaitSeconds,
    eligibleAt,
    estimatedWaitSeconds,
    nextTurnAt,
  };
}

export function requestSlot(userId, hallticket) {
  syncStateFromDisk();
  processQueue();

  const existing = globalState.jobByUserId.get(userId);

  if (existing?.status === "downloaded") {
    globalState.jobByUserId.delete(userId);
  }

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
    const metrics = buildQueuedMetrics(position, existing.eligibleAt);
    persistState();
    return {
      status: "queued",
      ...metrics,
      waitMessage: "Server is busy. Please wait in the virtual queue.",
    };
  }

  const requestedAt = Date.now();
  const eligibleAt = requestedAt + HALLTICKET_PREPARE_SECONDS * 1000;
  globalState.queue.push(userId);
  globalState.jobByUserId.set(userId, {
    userId,
    status: "queued",
    enqueuedAt: requestedAt,
    eligibleAt,
    hallticket,
  });

  processQueue();

  const queuedJob = globalState.jobByUserId.get(userId);
  if (queuedJob?.status === "ready") {
    persistState();
    return {
      status: "ready",
      waitMessage: "Your hall ticket is ready for download.",
      hallticket: queuedJob.hallticket,
      expiresAt: queuedJob.expiresAt,
    };
  }

  const position = globalState.queue.indexOf(userId) + 1;
  const metrics = buildQueuedMetrics(position, eligibleAt);
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

  if (job.status === "downloaded") {
    persistState();
    return {
      status: "downloaded",
      hallticket: job.hallticket,
      downloadedAt: job.downloadedAt || null,
      waitMessage: "Hall ticket already downloaded.",
    };
  }

  const position = globalState.queue.indexOf(userId) + 1;
  const metrics = buildQueuedMetrics(position, job.eligibleAt);
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

  if (job.status === "downloaded") {
    persistState();
    return { status: "downloaded", queuePosition: 0 };
  }

  persistState();
  return { status: "ready", queuePosition: 0 };
}
