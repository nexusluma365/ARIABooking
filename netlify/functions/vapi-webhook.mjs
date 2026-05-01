import { appendSheetRow } from "./_lib/google-sheets.mjs";
import { buildSheetRow, extractLeadFieldsFromText, summarizeMessages } from "./_lib/lead-utils.mjs";

function json(statusCode, payload) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { "Content-Type": "application/json" }
  });
}

function getWebhookSecret(request) {
  return (
    request.headers.get("x-vapi-secret") ||
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  );
}

export default async (request) => {
  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed." });
  }

  try {
    const configuredSecret = process.env.VAPI_WEBHOOK_SECRET;
    const incomingSecret = getWebhookSecret(request);

    if (configuredSecret && incomingSecret !== configuredSecret) {
      return json(401, { error: "Unauthorized." });
    }

    const payload = await request.json();
    const message = payload && payload.message ? payload.message : {};
    const type = message.type || "";

    if (type === "assistant-request" && process.env.VAPI_ASSISTANT_ID) {
      return json(200, { assistantId: process.env.VAPI_ASSISTANT_ID });
    }

    if (type === "tool-calls") {
      return json(200, { results: [] });
    }

    if (type !== "end-of-call-report") {
      return json(200, { ok: true, ignored: type || "unknown" });
    }

    const artifact = message.artifact || {};
    const transcript = artifact.transcript || summarizeMessages(artifact.messages || []);
    const bookingLead = extractLeadFieldsFromText(transcript, {});
    const row = buildSheetRow({
      source: "vapi-webhook",
      eventType: type,
      occurredAt: message.timestamp || new Date().toISOString(),
      bookingLead,
      context: {},
      transcript,
      endedReason: message.endedReason || "",
      callId: (message.call && (message.call.id || message.call.orgId)) || "",
      recordingUrl: artifact.recording && (artifact.recording.stereoUrl || artifact.recording.monoUrl || artifact.recording.url || "")
    });

    await appendSheetRow(row);
    return json(200, { ok: true });
  } catch (error) {
    console.error("vapi-webhook failed:", error);
    return json(500, { error: error.message || "Webhook processing failed." });
  }
};

