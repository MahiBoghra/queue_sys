/**
 * @file download-json.js
 * @description GET /api/hallticket/download-json
 *   Returns a self-contained, print-ready HTML page for the authenticated
 *   student's hall ticket.  The browser receives it as a downloadable .html
 *   file that opens directly into a printable document — no JSON involved.
 *
 *   The response Content-Type is text/html and Content-Disposition forces a
 *   file-save, so the student gets an offline-usable hall ticket they can
 *   open in any browser and Ctrl+P to print.
 * @module api/hallticket/download-json
 */

import { getStudentHallticketData } from "../_lib/appwrite.js";
import { parseCookies, sendJson, onlyGet } from "../_lib/http.js";
import { verifySessionToken }              from "../_lib/session.js";
import { getStatus }                       from "../_lib/queueEngine.js";

// ---------------------------------------------------------------------------
// HTML template builder
// ---------------------------------------------------------------------------

/**
 * Build a self-contained, print-ready HTML hall ticket string.
 * All styles are inlined so the file works without a network connection.
 *
 * @param {object} studentData
 * @param {string} studentData.name
 * @param {string} studentData.rollNumber
 * @param {string} studentData.course
 * @param {number} studentData.semester
 * @param {string} studentData.examDate
 * @param {string} studentData.center
 * @returns {string} Complete HTML document.
 */
function _buildHallTicketHtml(studentData) {
  const {
    name       = "N/A",
    rollNumber = "N/A",
    course     = "N/A",
    semester   = "N/A",
    examDate   = "N/A",
    center     = "N/A",
  } = studentData;

  const formattedDate = examDate !== "N/A"
    ? new Date(examDate).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : "N/A";

  const generatedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hall Ticket — ${name}</title>
  <style>
    /* ---- Reset --------------------------------------------------------- */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: "Segoe UI", Arial, sans-serif;
      background: #f4f6fb;
      color: #1a1a2e;
      padding: 24px;
    }

    /* ---- Print controls (hidden when printing) ------------------------- */
    .print-controls {
      text-align: center;
      margin-bottom: 24px;
    }
    .print-controls button {
      background: #4f46e5;
      color: #fff;
      border: none;
      padding: 10px 28px;
      border-radius: 8px;
      font-size: 15px;
      cursor: pointer;
      margin: 0 8px;
    }
    .print-controls button.secondary {
      background: #e5e7eb;
      color: #374151;
    }
    @media print {
      .print-controls { display: none; }
      body { background: #fff; padding: 0; }
      .ticket { box-shadow: none; border: 2px solid #1a1a2e; }
    }

    /* ---- Ticket card --------------------------------------------------- */
    .ticket {
      max-width: 780px;
      margin: 0 auto;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(79,70,229,.12);
      overflow: hidden;
    }

    /* Header band */
    .ticket-header {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: #fff;
      padding: 28px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .ticket-header .university-name { font-size: 20px; font-weight: 700; letter-spacing: .5px; }
    .ticket-header .doc-type        { font-size: 13px; opacity: .85; margin-top: 4px; }
    .ticket-header .official-stamp  {
      border: 2px solid rgba(255,255,255,.6);
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    /* Body */
    .ticket-body { padding: 32px; }

    /* Section title */
    .section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #6366f1;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid #e5e7eb;
    }

    /* Details table */
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    .details-table th, .details-table td {
      text-align: left;
      padding: 10px 12px;
      font-size: 14px;
    }
    .details-table th {
      width: 38%;
      color: #6b7280;
      font-weight: 600;
    }
    .details-table td {
      color: #111827;
      font-weight: 500;
    }
    .details-table tr:nth-child(even) { background: #f9fafb; }

    /* Subjects grid */
    .subjects-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 28px;
    }
    .subject-card {
      background: #f3f4f6;
      border-radius: 10px;
      padding: 14px 16px;
    }
    .subject-card .subj-code  { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
    .subject-card .subj-name  { font-size: 13px; font-weight: 600; }
    .subject-card .subj-date  { font-size: 12px; color: #4f46e5; margin-top: 4px; }

    /* Instructions */
    .instructions {
      background: #fef9c3;
      border-left: 4px solid #eab308;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 24px;
    }
    .instructions h4 { font-size: 13px; font-weight: 700; color: #854d0e; margin-bottom: 8px; }
    .instructions ul { padding-left: 18px; }
    .instructions li { font-size: 13px; color: #78350f; line-height: 1.7; }

    /* Footer */
    .ticket-footer {
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      padding: 16px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #9ca3af;
    }
    .ticket-footer .roll-badge {
      background: #4f46e5;
      color: #fff;
      border-radius: 20px;
      padding: 4px 14px;
      font-weight: 700;
      font-size: 13px;
    }
  </style>
</head>
<body>

  <div class="print-controls">
    <button onclick="window.print()">🖨️ Print Hall Ticket</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>

  <div class="ticket">

    <!-- Header -->
    <div class="ticket-header">
      <div>
        <div class="university-name">University Examination Board</div>
        <div class="doc-type">Final Semester Examination · 2026</div>
      </div>
      <div class="official-stamp">Official Hall Ticket</div>
    </div>

    <div class="ticket-body">

      <!-- Student details -->
      <div class="section-title">Student Information</div>
      <table class="details-table">
        <tbody>
          <tr><th>Full Name</th><td>${_escape(name)}</td></tr>
          <tr><th>Roll Number</th><td>${_escape(rollNumber)}</td></tr>
          <tr><th>Programme</th><td>${_escape(course)}</td></tr>
          <tr><th>Semester</th><td>${_escape(String(semester))}</td></tr>
          <tr><th>Exam Date</th><td>${_escape(formattedDate)}</td></tr>
          <tr><th>Exam Centre</th><td>${_escape(center)}</td></tr>
        </tbody>
      </table>

      <!-- Subject schedule (static sample row — extend with real data as needed) -->
      <div class="section-title">Subject Schedule</div>
      <div class="subjects-grid">
        <div class="subject-card">
          <div class="subj-code">CS801</div>
          <div class="subj-name">Computer Networks</div>
          <div class="subj-date">${_escape(formattedDate)} · 10:00 AM</div>
        </div>
        <div class="subject-card">
          <div class="subj-code">CS802</div>
          <div class="subj-name">Software Engineering</div>
          <div class="subj-date">${_escape(formattedDate)} · 02:00 PM</div>
        </div>
      </div>

      <!-- Instructions -->
      <div class="instructions">
        <h4>Important Instructions</h4>
        <ul>
          <li>Carry this hall ticket to the examination hall without fail.</li>
          <li>Arrive at least 30 minutes before the scheduled start time.</li>
          <li>A valid photo ID (Aadhar / College ID) is mandatory along with this ticket.</li>
          <li>Electronic devices are strictly prohibited inside the hall.</li>
          <li>This hall ticket is not transferable and is valid for the current examination only.</li>
        </ul>
      </div>

    </div><!-- /ticket-body -->

    <!-- Footer -->
    <div class="ticket-footer">
      <span>Generated: ${generatedAt}</span>
      <span class="roll-badge">${_escape(rollNumber)}</span>
      <span>university.edu.in | exams@university.edu.in</span>
    </div>

  </div><!-- /ticket -->

</body>
</html>`;
}

/**
 * Escape HTML special characters to prevent XSS in the generated document.
 * @param {string} str
 * @returns {string}
 */
function _escape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  if (!onlyGet(req, res)) return;

  try {
    const cookies = parseCookies(req);
    const session = verifySessionToken(cookies.session);

    if (!session) {
      return sendJson(res, 401, { error: "Session expired. Please login again." });
    }

    if (session.role !== "student") {
      return sendJson(res, 403, { error: "Only students can download a hall ticket." });
    }

    // Queue gate: only "ready" or "downloaded" states are allowed through.
    const queueStatus = getStatus(session.userId);
    if (queueStatus.status !== "ready" && queueStatus.status !== "downloaded") {
      return sendJson(res, 409, {
        error: "Hall ticket is not ready yet. Please wait in queue.",
        queueStatus,
      });
    }

    const studentData = await getStudentHallticketData(session.userId);
    if (!studentData) {
      return sendJson(res, 404, { error: "Student record not found." });
    }

    const htmlContent = _buildHallTicketHtml(studentData);
    const fileName    = `hallticket_${studentData.rollNumber}.html`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.status(200).send(htmlContent);

  } catch (error) {
    return sendJson(res, 500, { error: "Unable to prepare hall ticket download.", details: error.message });
  }
}
