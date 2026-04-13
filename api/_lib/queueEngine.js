/**
 * @file queueEngine.js
 * @description Virtual queue engine for rate-limited hall ticket access.
 *   Manages per-user job lifecycle: idle → queued → ready → downloaded.
 *   State is held in a process-level singleton and mirrored to a tmp file
 *   so it survives across serverless cold starts within the same machine.
 * @module _lib/queueEngine
 */

import {
  DOWNLOAD_WINDOW_SECONDS,
  HALLTICKET_PREPARE_SECONDS,
  QUEUE_RATE_LIMIT_PER_SECOND,
} from "./config.js";
import fs   from "fs";
import os   from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute path to the on-disk state snapshot. */
const DISK_STATE_PATH = path.join(os.tmpdir(), "queue_sys_state.json");

// ---------------------------------------------------------------------------
// Process-level singleton  (g_ prefix = module-global)
// ---------------------------------------------------------------------------

const g_state = globalThis.__QUEUE_ENGINE_STATE__ || _createDefaultState();
globalThis.__QUEUE_ENGINE_STATE__ = g_state;

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function _createDefaultState() {
  return {
    secondWindow:   0,
    processedCount: 0,
    queue:          [],
    jobByUserId:    new Map(),
  };
}

function _serializeState(state) {
  const jobs = {};
  state.jobByUserId.forEach((job, userId) => { jobs[userId] = job; });
  return {
    secondWindow:   Number(state.secondWindow)   || 0,
    processedCount: Number(state.processedCount) || 0,
    queue:          Array.isArray(state.queue) ? state.queue : [],
    jobs,
  };
}

function _hydrateState(raw) {
  const state = _createDefaultState();
  if (!raw || typeof raw !== "object") return state;
  state.secondWindow   = Number(raw.secondWindow)   || 0;
  state.processedCount = Number(raw.processedCount) || 0;
  state.queue          = Array.isArray(raw.queue) ? raw.queue : [];
  const rawJobs = (raw.jobs && typeof raw.jobs === "object") ? raw.jobs : {};
  state.jobByUserId    = new Map(Object.entries(rawJobs));
  return state;
}

// ---------------------------------------------------------------------------
// Disk persistence
// ---------------------------------------------------------------------------

function _readDiskState() {
  try {
    if (!fs.existsSync(DISK_STATE_PATH)) return null;
    const text = fs.readFileSync(DISK_STATE_PATH, "utf8");
    if (!text) return null;
    return _hydrateState(JSON.parse(text));
  } catch {
    return null;
  }
}

function _syncFromDisk() {
  const diskState = _readDiskState();
  if (!diskState) return;
  g_state.secondWindow   = diskState.secondWindow;
  g_state.processedCount = diskState.processedCount;
  g_state.queue          = diskState.queue;
  g_state.jobByUserId    = diskState.jobByUserId;
}

function _persistToDisk() {
  try {
    fs.writeFileSync(DISK_STATE_PATH, JSON.stringify(_serializeState(g_state)), "utf8");
  } catch {
    // Non-fatal: queue remains functional in-memory.
  }
}

// ---------------------------------------------------------------------------
// Rate-limit window
// ---------------------------------------------------------------------------

function _nowSecond() {
  return Math.floor(Date.now() / 1000);
}

function _rotateWindowIfNeeded() {
  const nowSec = _nowSecond();
  if (g_state.secondWindow !== nowSec) {
    g_state.secondWindow   = nowSec;
    g_state.processedCount = 0;
  }
}

// ---------------------------------------------------------------------------
// Job helpers
// ---------------------------------------------------------------------------

function _markReady(userId, hallticket) {
  const expiresAt = Date.now() + DOWNLOAD_WINDOW_SECONDS * 1000;
  const existing  = g_state.jobByUserId.get(userId) || {};
  g_state.jobByUserId.set(userId, {
    ...existing,
    userId,
    status:    "ready",
    readyAt:   Date.now(),
    expiresAt,
    hallticket,
  });
}

// ---------------------------------------------------------------------------
// Queue processor
//
// BUG FIX: original loop used `continue` when eligibleAt had not passed yet.
// Because the head of the queue was never shifted, this created an infinite
// loop the moment the first job's preparation delay was still in progress.
// Fix: use `break` — if the head is not eligible, nothing behind it is either.
// ---------------------------------------------------------------------------

function _processQueue() {
  _rotateWindowIfNeeded();

  while (
    g_state.queue.length > 0 &&
    g_state.processedCount < QUEUE_RATE_LIMIT_PER_SECOND
  ) {
    const headUserId = g_state.queue[0];
    const job        = g_state.jobByUserId.get(headUserId);

    // Phantom entry — discard and keep draining.
    if (!job || !job.hallticket) {
      g_state.queue.shift();
      continue;
    }

    const eligibleAt = Number(job.eligibleAt) || 0;
    if (eligibleAt > Date.now()) {
      break; // Head not eligible yet; nothing behind it can proceed either.
    }

    g_state.queue.shift();
    g_state.processedCount += 1;
    _markReady(headUserId, job.hallticket);
  }
}

// ---------------------------------------------------------------------------
// Metrics builder
// ---------------------------------------------------------------------------

function _buildQueuedMetrics(position, eligibleAt = 0) {
  const safePosition = Math.max(Number(position) || 0, 0);
  const safeRate     = Math.max(QUEUE_RATE_LIMIT_PER_SECOND, 1);
  const aheadCount   = Math.max(safePosition - 1, 0);

  const throughputWaitSec  = Math.ceil(safePosition / safeRate);
  const preparationWaitSec = Math.max(Math.ceil((Number(eligibleAt) - Date.now()) / 1000), 0);
  const estimatedWaitSec   = Math.max(throughputWaitSec, preparationWaitSec);
  const nextTurnAt         = Date.now() + estimatedWaitSec * 1000;

  return {
    position:                safePosition,
    aheadCount,
    queueLength:             g_state.queue.length,
    processingRatePerSecond: safeRate,
    preparationWaitSeconds:  preparationWaitSec,
    eligibleAt,
    estimatedWaitSeconds:    estimatedWaitSec,
    nextTurnAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function markDownloaded(userId) {
  _syncFromDisk();
  const current = g_state.jobByUserId.get(userId);
  if (!current) {
    _persistToDisk();
    return { status: "idle" };
  }
  g_state.queue = g_state.queue.filter((qId) => qId !== userId);
  g_state.jobByUserId.set(userId, {
    ...current,
    status:       "downloaded",
    downloadedAt: Date.now(),
  });
  _persistToDisk();
  return { status: "downloaded" };
}

export function requestSlot(userId, hallticket) {
  _syncFromDisk();
  _processQueue();

  const existing = g_state.jobByUserId.get(userId);

  if (existing?.status === "downloaded") {
    g_state.jobByUserId.delete(userId);
  }

  if (existing?.status === "ready") {
    if (Date.now() > existing.expiresAt) {
      g_state.jobByUserId.delete(userId);
      _persistToDisk();
    } else {
      _persistToDisk();
      return {
        status:      "ready",
        waitMessage: "Your hall ticket is ready for download.",
        hallticket:  existing.hallticket,
        expiresAt:   existing.expiresAt,
      };
    }
  }

  if (existing?.status === "queued") {
    const position = g_state.queue.indexOf(userId) + 1;
    const metrics  = _buildQueuedMetrics(position, existing.eligibleAt);
    _persistToDisk();
    return { status: "queued", ...metrics, waitMessage: "Server is busy. Please wait in the virtual queue." };
  }

  // New request.
  const requestedAt = Date.now();
  const eligibleAt  = requestedAt + HALLTICKET_PREPARE_SECONDS * 1000;

  g_state.queue.push(userId);
  g_state.jobByUserId.set(userId, { userId, status: "queued", enqueuedAt: requestedAt, eligibleAt, hallticket });

  _processQueue();

  const updatedJob = g_state.jobByUserId.get(userId);
  if (updatedJob?.status === "ready") {
    _persistToDisk();
    return { status: "ready", waitMessage: "Your hall ticket is ready for download.", hallticket: updatedJob.hallticket, expiresAt: updatedJob.expiresAt };
  }

  const position = g_state.queue.indexOf(userId) + 1;
  const metrics  = _buildQueuedMetrics(position, eligibleAt);
  _persistToDisk();
  return { status: "queued", ...metrics, waitMessage: "Server is busy. Please wait in the virtual queue." };
}

export function getStatus(userId) {
  _syncFromDisk();
  _processQueue();

  const job = g_state.jobByUserId.get(userId);

  if (!job) {
    _persistToDisk();
    return { status: "idle", waitMessage: "No active request. Click generate hall ticket." };
  }

  if (job.status === "ready") {
    if (Date.now() > job.expiresAt) {
      g_state.jobByUserId.delete(userId);
      _persistToDisk();
      return { status: "expired", waitMessage: "Download window expired. Request again." };
    }
    _persistToDisk();
    return {
      status:           "ready",
      hallticket:       job.hallticket,
      expiresAt:        job.expiresAt,
      expiresInSeconds: Math.max(Math.ceil((job.expiresAt - Date.now()) / 1000), 0),
      waitMessage:      "Your hall ticket is ready for download.",
    };
  }

  if (job.status === "downloaded") {
    _persistToDisk();
    return { status: "downloaded", hallticket: job.hallticket, downloadedAt: job.downloadedAt || null, waitMessage: "Hall ticket already downloaded." };
  }

  const position = g_state.queue.indexOf(userId) + 1;
  const metrics  = _buildQueuedMetrics(position, job.eligibleAt);
  _persistToDisk();
  return { status: "queued", ...metrics, waitMessage: "Server is busy. Please wait in the virtual queue." };
}

export function getQueueSnapshot() {
  _syncFromDisk();
  _processQueue();
  const jobs = {};
  g_state.jobByUserId.forEach((job, userId) => { jobs[userId] = { status: job.status, expiresAt: job.expiresAt || null }; });
  _persistToDisk();
  return { queue: [...g_state.queue], jobs };
}

export function getQueueMetaForUser(userId) {
  _syncFromDisk();
  _processQueue();
  const job = g_state.jobByUserId.get(userId);
  if (!job) { _persistToDisk(); return { status: "idle", queuePosition: 0 }; }
  if (job.status === "queued") { _persistToDisk(); return { status: "waiting", queuePosition: Math.max(g_state.queue.indexOf(userId) + 1, 0) }; }
  if (job.status === "downloaded") { _persistToDisk(); return { status: "downloaded", queuePosition: 0 }; }
  _persistToDisk();
  return { status: "ready", queuePosition: 0 };
}
