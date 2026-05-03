/**
 * ARIA Voice Call -> Google Sheets live sync
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 */

var SHEET_ID = '16Lpm5EM2oPkT56ddo6VrQirOHSCU6TJYEF4hIwpQtLM';
var SHEET_NAME = 'Warm Leads';

var COLUMNS = [
  'sessionId',
  'eventType',
  'occurredAt',
  'page',
  'name',
  'businessName',
  'location',
  'email',
  'phone',
  'appointmentTime',
  'bookingSlot',
  'availability',
  'bookingIntent',
  'completionPhrase',
  'questionnaireName',
  'questionnaireBusinessType',
  'questionnaireService',
  'questionnairePain',
  'questionnaireSpend',
  'questionnaireChallenge',
  'questionnaireContactProcess',
  'questionnaireAiHelp',
  'questionnaireSystemStatus',
  'transcript',
  'updatedAt',
  'emailSentAt',
  'emailStatus'
];

var HEADER_ALIASES = {
  sessionId: ['sessionid', 'session'],
  eventType: ['eventtype', 'event'],
  occurredAt: ['occurredat', 'timestamp', 'submittedat', 'createdat'],
  page: ['page', 'sourcepage'],
  name: ['name', 'fullname', 'contactname'],
  businessName: ['businessname', 'business', 'company', 'companyname', 'organization'],
  location: ['location', 'city', 'area'],
  email: ['email', 'emailaddress', 'contactemail'],
  phone: ['phone', 'phonenumber', 'contactphone'],
  appointmentTime: ['appointmenttime', 'appointment', 'appointmentdate', 'appointmentdatetime'],
  bookingSlot: ['bookingslot', 'bookedslot', 'confirmedslot', 'confirmedappointment', 'scheduledtime'],
  availability: ['availability', 'availabletime', 'preferredtime'],
  bookingIntent: ['bookingintent'],
  completionPhrase: ['completionphrase'],
  questionnaireName: ['questionnairename'],
  questionnaireBusinessType: ['questionnairebusinesstype'],
  questionnaireService: ['questionnaireservice'],
  questionnairePain: ['questionnairepain'],
  questionnaireSpend: ['questionnairespend'],
  questionnaireChallenge: ['questionnairechallenge'],
  questionnaireContactProcess: ['questionnairecontactprocess'],
  questionnaireAiHelp: ['questionnaireaihelp'],
  questionnaireSystemStatus: ['questionnairesystemstatus'],
  transcript: ['transcript', 'calltranscript'],
  updatedAt: ['updatedat', 'lastupdated'],
  emailSentAt: ['emailsentat', 'confirmationemailsentat'],
  emailStatus: ['emailstatus', 'confirmationemailstatus']
};

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(raw);

    var sheet = getOrCreateSheet_();
    var headerMap = ensureHeaders_(sheet);
    var normalized = normalizePayload_(payload);
    var existingRow = findWarmLeadRow_(sheet, headerMap, normalized);
    if (existingRow > 0) {
      normalized = mergeExistingWarmLead_(sheet, existingRow, headerMap, normalized);
    }
    var existingEmailSentAt = existingRow > 0 ? getCellByKey_(sheet, existingRow, headerMap, 'emailSentAt') : '';
    var existingEmailStatus = existingRow > 0 ? getCellByKey_(sheet, existingRow, headerMap, 'emailStatus') : '';
    var alreadySent = Boolean(existingEmailSentAt);

    if (alreadySent) {
      normalized.emailSentAt = existingEmailSentAt;
      normalized.emailStatus = existingEmailStatus || 'sent';
    }

    var targetRow = upsertRow_(sheet, normalized, headerMap, existingRow);

    if (shouldSendBookingEmail_(normalized) && !alreadySent) {
      var status = sendBookingEmail_(normalized);
      if (targetRow > 0) {
        setCellByKey_(sheet, targetRow, headerMap, 'emailSentAt', status.sentAt || '');
        setCellByKey_(sheet, targetRow, headerMap, 'emailStatus', status.status || '');
      }
    }

    return json_({ status: 'ok' });
  } catch (err) {
    Logger.log('doPost error: ' + err.message + '\n' + err.stack);
    return json_({ status: 'error', message: err.message });
  }
}

function doGet() {
  return json_({ status: 'ok', mode: 'GET' });
}

function testBookingConfirmationEmail() {
  var status = sendBookingEmail_({
    name: 'Test User',
    email: Session.getActiveUser().getEmail(),
    appointmentTime: 'tomorrow at 10:00 AM'
  });
  Logger.log(JSON.stringify(status));
  return status;
}

function normalizePayload_(p) {
  var completed = String(p.completed).toLowerCase() === 'true' || p.completed === true;
  return {
    sessionId: toStr_(p.sessionId),
    eventType: toStr_(p.eventType) || (completed ? 'questionnaire-complete' : 'questionnaire-update'),
    occurredAt: toStr_(p.occurredAt) || new Date().toISOString(),
    page: toStr_(p.page),
    name: toStr_(p.name),
    businessName: toStr_(p.businessName),
    location: toStr_(p.location),
    email: toStr_(p.email),
    phone: toStr_(p.phone),
    appointmentTime: toStr_(p.appointmentTime),
    bookingSlot: toStr_(p.bookingSlot || p.appointmentTime || p.availability),
    availability: toStr_(p.availability),
    bookingIntent: toStr_(p.bookingIntent),
    completionPhrase: toStr_(p.completionPhrase),
    questionnaireName: toStr_(p.questionnaireName || p.name),
    questionnaireBusinessType: toStr_(p.questionnaireBusinessType || p.businessName),
    questionnaireService: toStr_(p.questionnaireService || p.aiHelp),
    questionnairePain: toStr_(p.questionnairePain || p.challenge),
    questionnaireSpend: toStr_(p.questionnaireSpend),
    questionnaireChallenge: toStr_(p.questionnaireChallenge || p.challenge),
    questionnaireContactProcess: toStr_(p.questionnaireContactProcess || p.contactProcess),
    questionnaireAiHelp: toStr_(p.questionnaireAiHelp || p.aiHelp),
    questionnaireSystemStatus: toStr_(p.questionnaireSystemStatus || p.systemStatus),
    transcript: toStr_(p.transcript),
    updatedAt: toStr_(p.updatedAt) || new Date().toISOString(),
    emailSentAt: toStr_(p.emailSentAt),
    emailStatus: toStr_(p.emailStatus)
  };
}

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    styleHeader_(sheet, COLUMNS.length);
    return buildHeaderMap_(sheet);
  }

  var headerMap = buildHeaderMap_(sheet);
  var missing = [];
  for (var i = 0; i < COLUMNS.length; i++) {
    if (!headerMap[COLUMNS[i]]) missing.push(COLUMNS[i]);
  }

  if (missing.length) {
    var startCol = sheet.getLastColumn() + 1;
    sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
    styleHeader_(sheet, startCol + missing.length - 1);
    headerMap = buildHeaderMap_(sheet);
  }

  return headerMap;
}

function styleHeader_(sheet, width) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width)
    .setFontWeight('bold')
    .setBackground('#0b168d')
    .setFontColor('#ffffff');
}

function upsertRow_(sheet, payload, headerMap, targetRow) {
  var row = targetRow > 0 ? targetRow : -1;
  if (row < 0) {
    row = sheet.getLastRow() + 1;
  }

  for (var i = 0; i < COLUMNS.length; i++) {
    var key = COLUMNS[i];
    var value = payload[key] || '';
    if (!value && row <= sheet.getLastRow()) {
      value = getCellByKey_(sheet, row, headerMap, key);
    }
    setCellByKey_(sheet, row, headerMap, key, value);
  }

  return row;
}

function mergeExistingWarmLead_(sheet, row, headerMap, payload) {
  for (var i = 0; i < COLUMNS.length; i++) {
    var key = COLUMNS[i];
    if (!payload[key]) {
      payload[key] = getCellByKey_(sheet, row, headerMap, key);
    }
  }

  if (!payload.bookingSlot) {
    payload.bookingSlot = payload.appointmentTime || payload.availability || '';
  }

  return payload;
}

function buildHeaderMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  var map = {};

  for (var col = 0; col < headers.length; col++) {
    var normalizedHeader = normalizeHeader_(headers[col]);
    for (var i = 0; i < COLUMNS.length; i++) {
      var key = COLUMNS[i];
      if (!map[key] && headerMatchesKey_(normalizedHeader, key)) {
        map[key] = col + 1;
      }
    }
  }

  return map;
}

function headerMatchesKey_(normalizedHeader, key) {
  if (!normalizedHeader) return false;
  if (normalizedHeader === normalizeHeader_(key)) return true;
  var aliases = HEADER_ALIASES[key] || [];
  for (var i = 0; i < aliases.length; i++) {
    if (normalizedHeader === aliases[i]) return true;
  }
  return false;
}

function normalizeHeader_(value) {
  return toStr_(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getCellByKey_(sheet, row, headerMap, key) {
  var col = headerMap[key];
  if (!col || row < 1) return '';
  return toStr_(sheet.getRange(row, col).getValue());
}

function setCellByKey_(sheet, row, headerMap, key, value) {
  var col = headerMap[key];
  if (!col || row < 1) return;
  sheet.getRange(row, col).setValue(value || '');
}

function findWarmLeadRow_(sheet, headerMap, payload) {
  var bySession = findRowByKeyValue_(sheet, headerMap, 'sessionId', payload.sessionId);
  if (bySession > 0) return bySession;
  return findRowByKeyValue_(sheet, headerMap, 'email', payload.email);
}

function findRowBySession_(sheet, sessionId) {
  if (!sessionId) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(sessionId)) return i + 2;
  }
  return -1;
}

function findRowByKeyValue_(sheet, headerMap, key, value) {
  value = toStr_(value);
  var col = headerMap[key];
  var lastRow = sheet.getLastRow();
  if (!value || !col || lastRow < 2) return -1;
  var values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  var needle = key === 'email' ? value.toLowerCase() : value;
  for (var i = 0; i < values.length; i++) {
    var haystack = toStr_(values[i][0]);
    if (key === 'email') haystack = haystack.toLowerCase();
    if (haystack === needle) return i + 2;
  }
  return -1;
}

function shouldSendBookingEmail_(payload) {
  return String(payload.eventType).toLowerCase() === 'completion'
    && payload.email;
}

function sendBookingEmail_(payload) {
  try {
    var appointment = payload.appointmentTime || payload.availability || 'the time confirmed with ARIA';
    var firstName = firstName_(payload.name);
    var subject = 'Nexus Luma';
    var htmlBody = buildBookingEmailHtml_(firstName, appointment);
    var plainBody = [
      'Your Appointment Has Been Booked!',
      '',
      'Thank you for booking with ARIA by Nexus Luma.',
      'Your appointment is ' + appointment + '.',
      '',
      'We look forward to speaking with you.',
      '',
      'Nexus Luma'
    ].join('\n');

    MailApp.sendEmail({
      to: payload.email,
      subject: subject,
      name: 'Nexus Luma',
      body: plainBody,
      htmlBody: htmlBody
    });

    return { status: 'sent', sentAt: new Date().toISOString() };
  } catch (err) {
    Logger.log('sendBookingEmail_ error: ' + err.message + '\n' + err.stack);
    return { status: 'error: ' + err.message, sentAt: '' };
  }
}

function buildBookingEmailHtml_(firstName, appointment) {
  var safeName = escapeHtml_(firstName || 'there');
  var safeAppointment = escapeHtml_(appointment || 'the time confirmed with ARIA');
  return [
    '<!doctype html>',
    '<html>',
    '<body style="margin:0;padding:0;background:#eef7ff;font-family:Inter,Arial,sans-serif;color:#07144f;">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#07189f 0%,#1238c7 42%,#43c6ee 100%);padding:36px 16px;">',
    '<tr><td align="center">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 24px 70px rgba(7,24,159,0.24);">',
    '<tr><td style="padding:34px 34px 18px;text-align:left;">',
    '<div style="display:inline-block;padding:8px 12px;border-radius:999px;background:#e9fbff;color:#1238c7;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Nexus Luma</div>',
    '<h1 style="margin:22px 0 10px;font-size:32px;line-height:1.05;color:#07189f;letter-spacing:-.02em;">Your Appointment Has Been Booked!</h1>',
    '<p style="margin:0;color:#344273;font-size:16px;line-height:1.6;">Hi ' + safeName + ', <strong>Thank you for booking with ARIA by Nexus Luma.</strong></p>',
    '</td></tr>',
    '<tr><td style="padding:8px 34px 4px;">',
    '<div style="border:1px solid #d7efff;background:#f5fcff;border-radius:18px;padding:22px;">',
    '<div style="font-size:13px;font-weight:700;color:#1238c7;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Your Appointment Is</div>',
    '<div style="font-size:22px;line-height:1.35;font-weight:800;color:#07144f;">' + safeAppointment + '</div>',
    '</div>',
    '</td></tr>',
    '<tr><td style="padding:22px 34px 34px;">',
    '<p style="margin:0 0 14px;color:#344273;font-size:15px;line-height:1.65;">We have your appointment details saved. ARIA has captured the information needed for the next step, and Nexus Luma will use it to prepare a focused strategy conversation.</p>',
    '<p style="margin:0;color:#6b7394;font-size:13px;line-height:1.55;">If anything needs to change, reply to this email and we will help update it.</p>',
    '</td></tr>',
    '<tr><td style="padding:18px 34px;background:#07189f;color:#ffffff;">',
    '<div style="font-size:14px;font-weight:800;">Nexus Luma</div>',
    '<div style="font-size:12px;color:#b9f7ff;margin-top:4px;">AI booking systems built for cleaner client acquisition.</div>',
    '</td></tr>',
    '</table>',
    '</td></tr>',
    '</table>',
    '</body>',
    '</html>'
  ].join('');
}

function firstName_(name) {
  var text = toStr_(name);
  return text ? text.split(/\s+/)[0] : '';
}

function escapeHtml_(value) {
  return toStr_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toStr_(v) {
  return (v === undefined || v === null) ? '' : String(v).trim();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
