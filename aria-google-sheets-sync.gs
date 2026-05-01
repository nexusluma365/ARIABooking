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
  'transcript',
  'updatedAt'
];

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    var payload = JSON.parse(raw);

    var sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);
    upsertRow_(sheet, normalizePayload_(payload));

    return json_({ status: 'ok' });
  } catch (err) {
    Logger.log('doPost error: ' + err.message + '\n' + err.stack);
    return json_({ status: 'error', message: err.message });
  }
}

function doGet() {
  return json_({ status: 'ok', mode: 'GET' });
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
    transcript: toStr_(p.transcript),
    updatedAt: toStr_(p.updatedAt) || new Date().toISOString()
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

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var target = -1;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(payload.sessionId)) {
      target = i + 2;
      break;
    }
  }

  if (target > 0) {
    sheet.getRange(target, 1, 1, COLUMNS.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function toStr_(v) {
  return (v === undefined || v === null) ? '' : String(v).trim();
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
