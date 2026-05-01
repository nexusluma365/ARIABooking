import { appendSheetRow } from "./_lib/google-sheets.mjs";
import { buildSheetRow } from "./_lib/lead-utils.mjs";

function json(statusCode, payload) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { "Content-Type": "application/json" }
  });
}

function shouldAppend(eventType) {
  return ["call-end", "completion", "pagehide-active-call", "call-error", "questionnaire-complete"].includes(eventType);
}

async function readPayload(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return request.json();
  }

  const text = await request.text();
  return text ? JSON.parse(text) : {};
}

export default async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const payload = await readPayload(request);
    const secret = process.env.LEAD_SYNC_SECRET;
    const requestSecret = request.headers.get("x-lead-sync-secret");

    if (secret && requestSecret !== secret) {
      return json(401, { error: "Unauthorized." });
    }

    if (!shouldAppend(payload.eventType)) {
      return json(202, { ok: true, skipped: true });
    }

    const transcript = Array.isArray(payload.bookingLead && payload.bookingLead.rawTranscript)
      ? payload.bookingLead.rawTranscript.map((entry) => `${entry.role || "unknown"}: ${entry.text || ""}`).join("\n")
      : "";

    const row = buildSheetRow({
      source: "browser-sync",
      eventType: payload.eventType,
      occurredAt: payload.occurredAt,
      bookingLead: payload.bookingLead,
      context: payload.context,
      transcript
    });

    await appendSheetRow(row);
    return json(200, { ok: true });
  } catch (error) {
    console.error("lead-sync failed:", error);
    return json(500, { error: error.message || "Lead sync failed." });
  }
};
