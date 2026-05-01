const FIELD_PATTERNS = {
  name: /\b(?:name|my name is|this is)\s*(?:is|:)?\s*([A-Z][A-Za-z ,.'-]{1,80})/i,
  email: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  businessName: /\b(?:business|company|practice|studio)\s*(?:is|name is|:)?\s*([A-Z0-9][A-Za-z0-9 &,.''-]{1,100})/i,
  service: /\b(?:service|offer|sell|provide)\s*(?:is|:)?\s*([A-Za-z0-9 &,.''-]{2,100})/i,
  location: /\b(?:located in|location|based in|serve)\s*(?:is|:)?\s*([A-Za-z ,.'-]{2,100})/i
};

function valueAt(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function match(pattern, text) {
  const result = pattern.exec(text || "");
  return result ? String(result[1] || result[0]).trim() : "";
}

export function summarizeMessages(messages) {
  if (!Array.isArray(messages)) return "";
  return messages
    .map((message) => {
      const role = valueAt(message.role, message.type, "unknown");
      const text = valueAt(message.message, message.content, message.text, message.transcript);
      return text ? `${role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

export function extractLeadFieldsFromText(text, fallback = {}) {
  const source = text || "";
  return {
    name: valueAt(fallback.name, match(FIELD_PATTERNS.name, source)),
    email: valueAt(fallback.email, match(FIELD_PATTERNS.email, source)),
    businessName: valueAt(fallback.businessName, fallback.businessType, match(FIELD_PATTERNS.businessName, source)),
    service: valueAt(fallback.service, match(FIELD_PATTERNS.service, source)),
    location: valueAt(fallback.location, match(FIELD_PATTERNS.location, source)),
    pain: valueAt(fallback.pain, fallback.challenge, fallback.leadChallenge),
    spend: valueAt(fallback.spend, fallback.leadSpend),
    bookingIntent: valueAt(fallback.bookingIntent, fallback.intent)
  };
}

export function buildSheetRow(input = {}) {
  const bookingLead = input.bookingLead || {};
  const context = input.context || {};

  return [
    valueAt(input.occurredAt, new Date().toISOString()),
    valueAt(input.source),
    valueAt(input.eventType),
    valueAt(input.callId, bookingLead.callId, context.sessionId, input.sessionId),
    valueAt(bookingLead.name, context.name),
    valueAt(bookingLead.businessName, bookingLead.businessType, context.questionnaireBusinessType),
    valueAt(bookingLead.service, context.questionnaireService),
    valueAt(bookingLead.pain, bookingLead.challenge, context.questionnairePain),
    valueAt(bookingLead.spend, context.questionnaireSpend),
    valueAt(bookingLead.location, context.location),
    valueAt(bookingLead.email, context.email),
    valueAt(bookingLead.bookingIntent, context.bookingIntent),
    valueAt(input.endedReason, bookingLead.endedReason),
    valueAt(input.recordingUrl, bookingLead.recordingUrl),
    valueAt(input.transcript)
  ];
}
