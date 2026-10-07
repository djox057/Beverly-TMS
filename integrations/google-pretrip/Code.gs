/* Paste into the response sheet's Extensions → Apps Script, then run installPretripBridge. */
const TMS_ENDPOINT = 'https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/receive-pretrip-form';
const TMS_TOKEN = '__TMS_TOKEN__';
const TMS_COLUMNS = ['_TMS Status', '_TMS Error', '_TMS Hash'];

function installPretripBridge() {
  if (TMS_TOKEN === '__TMS_TOKEN__') throw new Error('Generate the connection script from TMS first.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!sheet) throw new Error('Open this script from the response sheet: Extensions → Apps Script.');
  PropertiesService.getScriptProperties().setProperty('PRETRIP_SHEET_ID', sheet.getId());
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (['onFormSubmitSplitLinks', 'sendPretripSubmission', 'retryPretripSubmissions'].indexOf(trigger.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger('sendPretripSubmission').forSpreadsheet(sheet).onFormSubmit().create();
  ScriptApp.newTrigger('retryPretripSubmissions').timeBased().everyMinutes(5).create();
  retryPretripSubmissions();
}

function onFormSubmitSplitLinks(event) { sendPretripSubmission(event); }

function sendPretripSubmission(event) {
  if (!event || !event.range) throw new Error('This function runs automatically when a driver submits the Google Form. Run installPretripBridge for setup.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // The retry trigger will pick up this row.
  try { sendPretripRow_(event.range.getSheet(), event.range.getRow()); }
  finally { lock.releaseLock(); }
}

function retryPretripSubmissions() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const id = PropertiesService.getScriptProperties().getProperty('PRETRIP_SHEET_ID');
    if (!id) throw new Error('Run installPretripBridge first.');
    const workbook = SpreadsheetApp.openById(id);
    const deadline = Date.now() + 240000;
    for (const sheet of workbook.getSheets()) {
      const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getDisplayValues()[0];
      if (!headers.some(h => h.trim().toLowerCase() === 'truck number') || !headers.some(h => h.trim().toLowerCase() === 'timestamp')) continue;
      const count = sheet.getLastRow() - 1;
      if (count <= 0) continue;
      const cursorKey = 'PRETRIP_CURSOR_' + sheet.getSheetId();
      const cursor = Math.max(2, Number(PropertiesService.getScriptProperties().getProperty(cursorKey) || 2));
      for (let offset = 0; offset < count; offset++) {
        const row = 2 + ((cursor - 2 + offset) % count);
        if (Date.now() > deadline) { PropertiesService.getScriptProperties().setProperty(cursorKey, String(row)); return; }
        sendPretripRow_(sheet, row);
      }
      PropertiesService.getScriptProperties().setProperty(cursorKey, '2');
    }
  } finally { lock.releaseLock(); }
}

function sendPretripRow_(sheet, rowNumber) {
  let allHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  for (const header of TMS_COLUMNS) {
    if (allHeaders.indexOf(header) < 0) {
      sheet.getRange(1, allHeaders.length + 1).setValue(header);
      allHeaders.push(header);
    }
  }
  const statusCell = sheet.getRange(rowNumber, allHeaders.indexOf('_TMS Status') + 1);
  const errorCell = sheet.getRange(rowNumber, allHeaders.indexOf('_TMS Error') + 1);
  const hashCell = sheet.getRange(rowNumber, allHeaders.indexOf('_TMS Hash') + 1);
  const raw = sheet.getRange(rowNumber, 1, 1, allHeaders.length).getValues()[0];
  const timezone = sheet.getParent().getSpreadsheetTimeZone();
  const headers = [], values = [];
  allHeaders.forEach((header, index) => {
    if (header.indexOf('_TMS ') === 0 || !header) return;
    headers.push(header);
    const value = raw[index];
    values.push(value instanceof Date ? Utilities.formatDate(value, timezone, header === 'Inspection Date' ? 'yyyy-MM-dd' : "yyyy-MM-dd'T'HH:mm:ss.SSS") : value);
  });
  if (!headers.some(h => h.trim().toLowerCase() === 'inspection date')) {
    const timestampIndex = allHeaders.findIndex(h => h.trim().toLowerCase() === 'timestamp');
    const timestamp = raw[timestampIndex];
    if (!(timestamp instanceof Date)) throw new Error('A valid submission timestamp is required.');
    headers.push('Inspection Date');
    values.push(Utilities.formatDate(timestamp, 'America/Chicago', 'yyyy-MM-dd'));
  }
  const fingerprint = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify([headers, values])).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  if (statusCell.getValue() === 'Imported' && hashCell.getValue() === fingerprint) return;
  try {
    const submission = tmsRequest_({headers: headers, values: values, sheet_id: sheet.getParent().getId(), sheet_tab: sheet.getName(), source_row: rowNumber, timezone: timezone});
    if (!submission.truck_id) throw new Error('No unique active truck matches this truck number. Correct it and the next retry will import the response.');
    let failed = false;
    for (const item of submission.files || []) {
      if (item.status === 'imported') continue;
      try {
        const blob = DriveApp.getFileById(item.drive_id).getBlob();
        tmsRequest_({submission_id: submission.id, drive_id: item.drive_id, category: item.category, file: blob}, true);
      } catch (error) {
        failed = true;
        console.warn(item.category + ": " + String(error.message || error).slice(0, 300));
        // No private URLs or Google credentials are sent to TMS.
        tmsRequest_({action:'photo_error', submission_id:submission.id, drive_id:item.drive_id, category:item.category, error:'Google photo could not be forwarded. Check the trigger owner has access and the image is at most 10 MB.'});

      }
    }
    if (failed) throw new Error('Some photos failed; imported photos are retained and failures retry automatically.');
    statusCell.setValue('Imported'); errorCell.clearContent(); hashCell.setValue(fingerprint);
  } catch (error) {
    statusCell.setValue('Retry pending'); errorCell.setValue(String(error.message || error).slice(0,500));
  }
}

function tmsRequest_(payload, multipart) {
  const options = {method:'post', headers:{'x-pretrip-token':TMS_TOKEN}, muteHttpExceptions:true, payload:multipart ? payload : JSON.stringify(payload)};
  if (!multipart) options.contentType = 'application/json';
  const response = UrlFetchApp.fetch(TMS_ENDPOINT, options);
  let result;
  try { result = JSON.parse(response.getContentText()); } catch (_) { throw new Error('TMS returned an invalid response. Will retry.'); }
  if (response.getResponseCode() >= 400) throw new Error(result.error || ('TMS request failed (' + response.getResponseCode() + ')'));
  return result;
}
