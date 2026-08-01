/**
 * LRI MUN X Operations Hub — Google Forms/Sheets ingestion.
 *
 * Setup
 * -----
 * 1. Open the registration Sheet → Extensions → Apps Script, paste this file.
 * 2. Project Settings → Script Properties, add:
 *      HUB_ENDPOINT   https://<your-host>/api/v1/integrations/google-sheets
 *      WEBHOOK_SECRET the value of GOOGLE_SHEETS_WEBHOOK_SECRET from the API's .env
 * 3. Triggers → Add Trigger → onFormSubmit → From spreadsheet → On form submit.
 * 4. Optionally run syncAllRows() once to backfill everything already collected.
 *
 * The endpoint is idempotent on email: re-sending a row updates the delegate
 * rather than creating a duplicate.
 */

/**
 * Sheet column → API field. Anything not listed here is ignored, so extra
 * columns (timestamps, consent checkboxes, scoring notes) are harmless.
 *
 * Committee and country are deliberately absent: those are allocated in the
 * app, not answered on a form. A preference is a wish and does import.
 */
var HEADER_MAP = {
  'full name': 'fullName',
  'name': 'fullName',
  'delegate name': 'fullName',
  'email': 'email',
  'email address': 'email',
  'phone': 'phone',
  'phone number': 'phone',
  'mobile': 'phone',
  'contact': 'phone',
  'school': 'schoolName',
  'school name': 'schoolName',
  'institution': 'schoolName',
  'grade': 'grade',
  'class': 'grade',
  'year': 'grade',
  'committee preference': 'committeePreference',
  'preference': 'committeePreference',
  'preferred committee': 'committeePreference',
  'committee choice': 'committeePreference',
  'first preference': 'committeePreference',
  'committee preference 1': 'committeePreference',
  'dietary notes': 'dietaryNotes',
  'dietary': 'dietaryNotes',
  'food requirements': 'dietaryNotes',
  'accessibility notes': 'accessibilityNotes',
  'accessibility': 'accessibilityNotes'
};

function config_() {
  var props = PropertiesService.getScriptProperties();
  var endpoint = props.getProperty('HUB_ENDPOINT');
  var secret = props.getProperty('WEBHOOK_SECRET');
  if (!endpoint || !secret) {
    throw new Error('Set HUB_ENDPOINT and WEBHOOK_SECRET in Script Properties before running.');
  }
  return { endpoint: endpoint, secret: secret };
}

function normaliseKey_(header) {
  var key = String(header || '').trim().toLowerCase();
  return HEADER_MAP[key] || null;
}

function rowToDelegate_(headers, values) {
  var row = {};
  for (var i = 0; i < headers.length; i++) {
    var field = normaliseKey_(headers[i]);
    if (!field) continue;
    var value = values[i];
    if (value === null || value === undefined) continue;
    value = String(value).trim();
    if (value === '') continue;
    row[field] = value;
  }
  return row;
}

function post_(rows) {
  if (!rows.length) return null;
  var cfg = config_();

  var response = UrlFetchApp.fetch(cfg.endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Webhook-Secret': cfg.secret },
    payload: JSON.stringify({ rows: rows, upsert: true }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  // 207 means some rows were rejected — surface it rather than failing silently.
  if (code !== 200 && code !== 207) {
    Logger.log('Hub rejected the batch (' + code + '): ' + body);
    throw new Error('Hub returned ' + code);
  }

  Logger.log('Hub accepted ' + rows.length + ' row(s): ' + body);
  return JSON.parse(body);
}

/** Trigger target: fires once per form submission. */
function onFormSubmit(event) {
  var sheet = event.range.getSheet();
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = event.range.getValues()[0];

  var delegate = rowToDelegate_(headers, values);
  if (!delegate.email) {
    Logger.log('Skipped a submission with no email address.');
    return;
  }

  post_([delegate]);
}

/** One-off backfill of every row currently in the sheet, in batches of 200. */
function syncAllRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  var batch = [];
  for (var i = 0; i < data.length; i++) {
    var delegate = rowToDelegate_(headers, data[i]);
    if (!delegate.email) continue;
    batch.push(delegate);

    if (batch.length === 200) {
      post_(batch);
      batch = [];
    }
  }

  post_(batch);
}
