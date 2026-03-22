import { DOWNLOAD_WINDOW_SECONDS, QUEUE_RATE_LIMIT_PER_SECOND } from "./config.js";

const globalState = globalThis.__QUEUE_STATE__ || {
  secondWindow: 0,
  processedCount: 0,
  queue: [],
  jobByUserId: new Map(),
};

globalThis.__QUEUE_STATE__ = globalState;

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
  processQueue();

  const existing = globalState.jobByUserId.get(userId);

  if (existing?.status === "ready") {
    if (Date.now() > existing.expiresAt) {
      globalState.jobByUserId.delete(userId);
    } else {
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

  return {
    status: "queued",
    ...metrics,
    waitMessage: "Server is busy. Please wait in the virtual queue.",
  };
}

export function getStatus(userId) {
  processQueue();

  const job = globalState.jobByUserId.get(userId);
  if (!job) {
    return {
      status: "idle",
      waitMessage: "No active request. Click generate hall ticket.",
    };
  }

  if (job.status === "ready") {
    if (Date.now() > job.expiresAt) {
      globalState.jobByUserId.delete(userId);
      return {
        status: "expired",
        waitMessage: "Download window expired. Request again.",
      };
    }

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
  return {
    status: "queued",
    ...metrics,
    waitMessage: "Server is busy. Please wait in the virtual queue.",
  };
}

export function getQueueSnapshot() {
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

  return snapshot;
}

export function getQueueMetaForUser(userId) {
  processQueue();

  const job = globalState.jobByUserId.get(userId);
  if (!job) {
    return { status: "idle", queuePosition: 0 };
  }

  if (job.status === "queued") {
    return {
      status: "waiting",
      queuePosition: Math.max(globalState.queue.indexOf(userId) + 1, 0),
    };
  }

  return { status: "ready", queuePosition: 0 };
}
