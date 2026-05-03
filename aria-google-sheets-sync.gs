/**
 * Nexus Luma questionnaire + ARIA booking sync
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 */

var SHEET_ID = '16Lpm5EM2oPkT56ddo6VrQirOHSCU6TJYEF4hIwpQtLM';
var SHEET_NAME = 'Warm Leads';

var COLUMNS = [
  'sessionId',
  'submittedAt',
  'name',
  'businessName',
  'email',
  'challenge',
  'contactProcess',
  'aiHelp',
  'systemStatus',
  'questionnaireCompleted',
  'bookingSlot',
  'bookingConfirmedAt',
  'confirmationEmailSentAt',
  'confirmationEmailStatus'
];

var HEADER_ALIASES = {
  sessionId: ['sessionid', 'session'],
  submittedAt: ['submittedat', 'occurredat', 'createdat', 'timestamp', 'updatedat'],
  name: ['name', 'fullname', 'contactname', 'questionnairename'],
  businessName: ['businessname', 'business', 'company', 'companyname', 'organization', 'questionnairebusinesstype'],
  email: ['email', 'emailaddress', 'contactemail'],
  challenge: ['challenge', 'questionnairechallenge', 'questionnairepain'],
  contactProcess: ['contactprocess', 'questionnairecontactprocess'],
  aiHelp: ['aihelp', 'questionnaireaihelp', 'questionnaireservice'],
  systemStatus: ['systemstatus', 'questionnairesystemstatus'],
  questionnaireCompleted: ['questionnairecompleted', 'completed'],
  bookingSlot: ['bookingslot', 'appointmenttime', 'appointment', 'availability', 'confirmedslot', 'scheduledtime'],
  bookingConfirmedAt: ['bookingconfirmedat'],
  confirmationEmailSentAt: ['confirmationemailsentat', 'emailsentat'],
  confirmationEmailStatus: ['confirmationemailstatus', 'emailstatus']
};

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(raw);
    var sheet = getOrCreateSheet_();
    var headerMap = ensureHeaders_(sheet);
    var existingRow = findWarmLeadRow_(sheet, headerMap, payload);
    var isAria = isAriaPayload_(payload);
    var targetRow;

    if (isAria) {
      targetRow = handleAriaBooking_(sheet, headerMap, existingRow, payload);
    } else {
      targetRow = handleQuestionnaire_(sheet, headerMap, existingRow, payload);
    }

    return json_({ status: 'ok', row: targetRow, mode: isAria ? 'aria-booking' : 'questionnaire' });
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
    bookingSlot: 'tomorrow at 10:00 AM'
  });
  Logger.log(JSON.stringify(status));
  return status;
}

function handleQuestionnaire_(sheet, headerMap, existingRow, payload) {
  var row = existingRow > 0 ? existingRow : sheet.getLastRow() + 1;
  var completed = String(payload.completed).toLowerCase() === 'true' || payload.completed === true;
  var submittedAt = getCellByKey_(sheet, row, headerMap, 'submittedAt') || toStr_(payload.updatedAt) || new Date().toISOString();

  setCellByKey_(sheet, row, headerMap, 'sessionId', toStr_(payload.sessionId));
  setCellByKey_(sheet, row, headerMap, 'submittedAt', submittedAt);
  setCellByKey_(sheet, row, headerMap, 'name', toStr_(payload.name));
  setCellByKey_(sheet, row, headerMap, 'businessName', toStr_(payload.businessName));
  setCellByKey_(sheet, row, headerMap, 'email', toStr_(payload.email).toLowerCase());
  setCellByKey_(sheet, row, headerMap, 'challenge', toStr_(payload.challenge));
  setCellByKey_(sheet, row, headerMap, 'contactProcess', toStr_(payload.contactProcess));
  setCellByKey_(sheet, row, headerMap, 'aiHelp', toStr_(payload.aiHelp));
  setCellByKey_(sheet, row, headerMap, 'systemStatus', toStr_(payload.systemStatus));
  setCellByKey_(sheet, row, headerMap, 'questionnaireCompleted', completed ? 'Yes' : getCellByKey_(sheet, row, headerMap, 'questionnaireCompleted'));

  return row;
}

function handleAriaBooking_(sheet, headerMap, existingRow, payload) {
  var row = existingRow > 0 ? existingRow : sheet.getLastRow() + 1;
  var bookingSlot = extractBookingSlot_(payload);
  var existingEmailSentAt = getCellByKey_(sheet, row, headerMap, 'confirmationEmailSentAt');
  var email = getCellByKey_(sheet, row, headerMap, 'email');
  var name = getCellByKey_(sheet, row, headerMap, 'name');

  if (!getCellByKey_(sheet, row, headerMap, 'sessionId')) {
    setCellByKey_(sheet, row, headerMap, 'sessionId', toStr_(payload.sessionId));
  }

  if (bookingSlot) {
    setCellByKey_(sheet, row, headerMap, 'bookingSlot', bookingSlot);
    setCellByKey_(sheet, row, headerMap, 'bookingConfirmedAt', new Date().toISOString());
  }

  if (!email) {
    setCellByKey_(sheet, row, headerMap, 'confirmationEmailStatus', 'missing questionnaire email');
    return row;
  }

  if (String(payload.eventType).toLowerCase() === 'completion' && !existingEmailSentAt) {
    var status = sendBookingEmail_({
      name: name,
      email: email,
      bookingSlot: bookingSlot || getCellByKey_(sheet, row, headerMap, 'bookingSlot')
    });
    setCellByKey_(sheet, row, headerMap, 'confirmationEmailSentAt', status.sentAt || '');
    setCellByKey_(sheet, row, headerMap, 'confirmationEmailStatus', status.status || '');
  }

  return row;
}

function isAriaPayload_(payload) {
  return Boolean(payload.eventType);
}

function extractBookingSlot_(payload) {
  return toStr_(payload.bookingSlot || payload.appointmentTime || payload.availability);
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
  if (!col || row < 1 || row > sheet.getMaxRows()) return '';
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

function sendBookingEmail_(payload) {
  try {
    var appointment = payload.bookingSlot || 'the time confirmed with ARIA';
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
    '<p style="margin:0 0 14px;color:#344273;font-size:15px;line-height:1.65;">We have your appointment details saved. ARIA has captured the confirmed booking time and Nexus Luma will use it to prepare your strategy conversation.</p>',
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

function toStr_(value) {
  return (value === undefined || value === null) ? '' : String(value).trim();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
