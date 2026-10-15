// Replace the earlier experimental script with this whole file, then redeploy.
const HEADERS = ['معرّف المهمة','الكورس','الشابتر','مجال العمل','المهمة',
  'المنفّذون وأكوادهم','الحالة','تاريخ البداية','موعد التسليم',
  'تاريخ التسليم الفعلي','آخر تحديث','رابط الأداة'];

function setup() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName('Tasks') || book.insertSheet('Tasks');
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', book.getId());
  if (!props.getProperty('SYNC_TOKEN'))
    props.setProperty('SYNC_TOKEN', Utilities.getUuid() + Utilities.getUuid());
  if (!props.getProperty('WEBHOOK_SECRET'))
    props.setProperty('WEBHOOK_SECRET', Utilities.getUuid() + Utilities.getUuid());
  sheet.getRange(1,1,1,HEADERS.length).setValues([HEADERS])
    .setBackground('#408a71').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setRightToLeft(true);
  sheet.autoResizeColumns(1,HEADERS.length);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
    if (!token || !body.token || body.token !== token) throw new Error('Unauthorized');
    return jsonResponse(saveTask(body.task, body.observedAt));
  } catch (error) {
    return jsonResponse({ok:false,error:error.message});
  }
}

function saveTask(task, observedAt) {
  if (!task || !task.id || !task.status || !Number.isFinite(observedAt))
    throw new Error('Invalid task payload');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const props = PropertiesService.getScriptProperties();
    const key = 'LAST_SYNC_' + task.id;
    if (Number(props.getProperty(key) || 0) > observedAt) return {ok:true,stale:true};
    const sheet = SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getSheetByName('Tasks');
    const last = sheet.getLastRow();
    const ids = last > 1 ? sheet.getRange(2,1,last-1,1).getDisplayValues().flat() : [];
    const index = ids.indexOf(String(task.id));
    const row = index < 0 ? last + 1 : index + 2;
    const labels = {planned:'مخططة',ready:'جاهزة للبدء',in_progress:'قيد التنفيذ',
      in_review:'بانتظار المراجعة',approved:'معتمدة',changes_requested:'بحاجة لتعديل',blocked:'متوقفة'};
    const values = [task.id,task.course,task.chapter,task.area,task.name,task.executors,
      labels[task.status] || task.status,task.startDate,task.dueDate,task.submittedAt,
      new Date(observedAt).toISOString(),task.url].map(value => {
        const text = String(value == null ? '' : value);
        return /^[=+\-@]/.test(text) ? "'" + text : text;
      });
    sheet.getRange(row,1,1,HEADERS.length).setValues([values]);
    SpreadsheetApp.flush();
    props.setProperty(key,String(observedAt));
    return {ok:true};
  } finally { lock.releaseLock(); }
}

function jsonResponse(body) {
  return ContentService.createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

function testConnection() {
  saveTask({id:'TEST-001',course:'كورس تجريبي',chapter:'Chapter 1',area:'Questions',
    name:'تجربة الربط',executors:'عضو تجريبي — M001',status:'in_review'},Date.now());
}
