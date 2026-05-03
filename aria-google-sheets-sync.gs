/**
 * ARIA Voice Call -> Google Sheets live sync
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 */

var SHEET_ID = '16Lpm5EM2oPkT56ddo6VrQirOHSCU6TJYEF4hIwpQtLM';
var SHEET_NAME = 'Aria Calls';

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

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(raw);

    var sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);
    var normalized = normalizePayload_(payload);
    var existingRow = findRowBySession_(sheet, normalized.sessionId);
    var existingEmailSentAt = existingRow > 0 ? toStr_(sheet.getRange(existingRow, COLUMNS.indexOf('emailSentAt') + 1).getValue()) : '';
    var existingEmailStatus = existingRow > 0 ? toStr_(sheet.getRange(existingRow, COLUMNS.indexOf('emailStatus') + 1).getValue()) : '';
    var alreadySent = Boolean(existingEmailSentAt);

    if (alreadySent) {
      normalized.emailSentAt = existingEmailSentAt;
      normalized.emailStatus = existingEmailStatus || 'sent';
    }

    upsertRow_(sheet, normalized);

    if (shouldSendBookingEmail_(normalized) && !alreadySent) {
      var status = sendBookingEmail_(normalized);
      var targetRow = findRowBySession_(sheet, normalized.sessionId);
      if (targetRow > 0) {
        sheet.getRange(targetRow, COLUMNS.indexOf('emailSentAt') + 1).setValue(status.sentAt || '');
        sheet.getRange(targetRow, COLUMNS.indexOf('emailStatus') + 1).setValue(status.status || '');
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
  return {
    sessionId: toStr_(p.sessionId),
    eventType: toStr_(p.eventType),
    occurredAt: toStr_(p.occurredAt) || new Date().toISOString(),
    page: toStr_(p.page),
    name: toStr_(p.name),
    businessName: toStr_(p.businessName),
    location: toStr_(p.location),
    email: toStr_(p.email),
    phone: toStr_(p.phone),
    appointmentTime: toStr_(p.appointmentTime),
    availability: toStr_(p.availability),
    bookingIntent: toStr_(p.bookingIntent),
    completionPhrase: toStr_(p.completionPhrase),
    questionnaireName: toStr_(p.questionnaireName),
    questionnaireBusinessType: toStr_(p.questionnaireBusinessType),
    questionnaireService: toStr_(p.questionnaireService),
    questionnairePain: toStr_(p.questionnairePain),
    questionnaireSpend: toStr_(p.questionnaireSpend),
    questionnaireChallenge: toStr_(p.questionnaireChallenge),
    questionnaireContactProcess: toStr_(p.questionnaireContactProcess),
    questionnaireAiHelp: toStr_(p.questionnaireAiHelp),
    questionnaireSystemStatus: toStr_(p.questionnaireSystemStatus),
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
  var maxCols = Math.max(sheet.getLastColumn(), COLUMNS.length);
  var existing = maxCols > 0 ? sheet.getRange(1, 1, 1, maxCols).getValues()[0] : [];

  var rewrite = sheet.getLastRow() === 0;
  if (!rewrite) {
    for (var i = 0; i < COLUMNS.length; i++) {
      if (existing[i] !== COLUMNS[i]) {
        rewrite = true;
        break;
      }
    }
  }

  if (rewrite) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length)
      .setFontWeight('bold')
      .setBackground('#0b168d')
      .setFontColor('#ffffff');
  }
}

function upsertRow_(sheet, payload) {
  var row = COLUMNS.map(function (k) { return payload[k] || ''; });

  if (!payload.sessionId) {
    sheet.appendRow(row);
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.appendRow(row);
    return;
  }

  var target = findRowBySession_(sheet, payload.sessionId);

  if (target > 0) {
    sheet.getRange(target, 1, 1, COLUMNS.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
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
