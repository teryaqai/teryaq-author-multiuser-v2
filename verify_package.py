from pathlib import Path
import re, sys

root=Path(__file__).parent
required=[
    'index.html','styles.css','platform.js','app.js',
    'styles.v2.4.4.css','platform.v2.4.4.js','app.v2.4.4.js',
    'sw.js','manifest.webmanifest','README.md','UPDATE_AND_MIGRATION_POLICY.md',
    'AI_REVIEW_BRIEF.md','UPLOAD_v2.4.4.md','render.yaml','VERSION.json',
    'vendor/jszip.min.js','vendor/JSZip-LICENSE.md',
    'fonts/Tajawal-Regular.ttf','fonts/Tajawal-Medium.ttf','fonts/Tajawal-Bold.ttf'
]
missing=[x for x in required if not (root/x).exists()]
if missing:
    print('MISSING:',missing);sys.exit(1)

html=(root/'index.html').read_text(encoding='utf-8')
ids=re.findall(r'\bid="([^"]+)"',html)
dups=sorted({x for x in ids if ids.count(x)>1})
if dups:
    print('DUPLICATE IDS:',dups);sys.exit(1)
for x in ['authGate','authPasswordToggle','authCloudToggle','authCloudPanel','authCloudClose','authCloudScrim','authOfflineIdentity','appShell','appSidebar','sidebarCollapse','syncBtn','settingsBtn','adminBtn','trashBtn','documentsView','documentBulkBar','bulkDeleteDocuments','clearDocumentSelection','accountView','adminView','leftPanel','editorContentColumn','tableRegister','outlineViewBtn','outlineCloseBtn','outlineScrim','modalBody','appVersionBadge','sidebarAppVersion','exportMenu','exportMenuButton','exportMenuPanel','htmlExportBtn','importDocxTableBtn','viewOnlyBtn']:
    if f'id="{x}"' not in html:
        print('MISSING HTML ID:',x);sys.exit(1)

platform=(root/'platform.js').read_text(encoding='utf-8')
for marker in ['AUTO_SYNC_KEY','AUTO_SYNC_INTERVAL_MS','autoSyncToggle','scheduleAutoSync']:
    if marker not in platform:
        print('MISSING AUTO SYNC MARKER:',marker);sys.exit(1)
for marker in ['updateDisplayName','restoreTrashItem','showTrashPage','showAccountPage']:
    if marker not in platform:
        print('MISSING V2.3 MARKER:',marker);sys.exit(1)
for marker in ['repairDocumentIdentity',"localStatus!=='synced'",'Automatic backup before document identity repair','teryaq-document-rekeyed']:
    if marker not in platform:
        print('MISSING V2.3.2 RELIABILITY MARKER:',marker);sys.exit(1)
for marker in ['sameLocalRevision','reconcileSuccessfulPush','reconcileRemoteDocument','newer-local-pending','teryaq-document-sync-metadata','still pending']:
    if marker not in platform:
        print('MISSING V2.3.4 SYNC-RACE MARKER:',marker);sys.exit(1)
for marker in ['conflictSnapshot','restoreConflict','restore-after-delete','Deletion is retrying against the latest cloud version.','reconcileTrashedConflicts','bindPasswordToggle','authPasswordToggle','backup-explainer']:
    if marker not in platform:
        print('MISSING V2.4.1 PLATFORM MARKER:',marker);sys.exit(1)
for marker in ['authCloudPanel','setCloudPanel','authOfflineIdentity','Continue Offline as']:
    if marker not in platform:
        print('MISSING V2.4.2 RESPONSIVE AUTH MARKER:',marker);sys.exit(1)
for marker in ['existingTrash?.document','{...(existingTrash||{})','existingTrash?.title||deletedDoc.title']:
    if marker not in platform:
        print('REMOTE DELETE PULL MUST PRESERVE THE EXISTING LOCAL TRASH RECORD:',marker);sys.exit(1)
delete_region=platform[platform.find('async function queueDelete'):platform.find('async function ownedDocuments')]
for marker in ["await get('conflicts',id)",'hadConflict:Boolean','conflictSnapshot:',"await del('conflicts',id)"]:
    if marker not in delete_region:
        print('INCOMPLETE CONFLICT-AWARE TRASH MOVE:',marker);sys.exit(1)
restore_region=platform[platform.find('async function restoreTrashItem'):platform.find('async function repairDocumentIdentity')]
for marker in ['restoreConflict','status:restoreConflict?',"await put('conflicts',saved)"]:
    if marker not in restore_region:
        print('INCOMPLETE CONFLICT RESTORE:',marker);sys.exit(1)
conflict_ui_region=platform[platform.find('async function resolveConflicts'):platform.find('async function exportWorkspaceBackup')]
if "else await del('documents',c.documentId)" not in conflict_ui_region:
    print('REMOTE-DELETE SAVE-BOTH MUST REMOVE THE ORIGINAL AFTER PRESERVING A COPY');sys.exit(1)
push_region=platform[platform.find('async function pushQueueItem'):platform.find('function reconcileRemoteDocument')]
if 'reconcileSuccessfulPush' not in push_region or "await put('documents',doc)" in push_region:
    print('UNSAFE PUSH RESPONSE: must reconcile the latest local revision instead of writing the sent snapshot');sys.exit(1)
reconcile_region=platform[platform.find('function reconcileSuccessfulPush'):platform.find('function recordEditConflict')]
for marker in ["db.transaction(['documents','syncQueue'],'readwrite')",'sameLocalRevision(sent,latest)',"status:newerLocal?'pending':'synced'",'if(newerLocal)queue.put','else queue.delete']:
    if marker not in reconcile_region:
        print('INCOMPLETE ATOMIC PUSH RECONCILIATION:',marker);sys.exit(1)
sync_region=platform[platform.find('async function syncNow'):platform.find('function setSyncLabel')]
if sync_region.find('remainingQueue')>sync_region.find("setSyncLabel('Synced ✓')") or sync_region.find('remainingConflicts')>sync_region.find("setSyncLabel('Synced ✓')"):
    print('FALSE SYNC STATUS RISK: queue/conflicts must be checked before Synced');sys.exit(1)

app=(root/'app.js').read_text(encoding='utf-8')
for marker in ['EMERGENCY_DRAFT_PREFIX','saveAndSyncCurrent','pagehide','beforeunload','cloud version','localSaveToken','requestPersistentStorage','appVersionBadge','idbPutDocumentPreservingSync','teryaq-remote-document-applied']:
    if marker not in app:
        print('MISSING SAVE/RECOVERY MARKER:',marker);sys.exit(1)
save_sync=re.search(r'async function saveAndSyncCurrent\(\)\{(.+?)\n\}',app,re.S)
if not save_sync or save_sync.group(1).find('await saveCurrent(true)')<0 or save_sync.group(1).find('await saveCurrent(true)')>save_sync.group(1).find('TeryaqPlatform.syncNow()'):
    print('INVALID HOTFIX ORDER: Sync must await local Save first');sys.exit(1)
if "byId('syncBtnEditor').onclick=()=>saveAndSyncCurrent()" not in app:
    print('INVALID EDITOR SYNC HANDLER');sys.exit(1)
for forbidden in ['busyWasReadonly','busyContenteditable']:
    if forbidden in app:
        print('AUTOSAVE FOCUS REGRESSION:',forbidden);sys.exit(1)
if 'blockingSaveInFlight' not in app:
    print('MISSING NONBLOCKING AUTOSAVE MARKER');sys.exit(1)
save_region=app[app.find('async function saveCurrent'):app.find('async function saveAndSyncCurrent')]
if 'idbPutDocumentPreservingSync(snapshot)' not in save_region or "idbPut('documents',snapshot)" in save_region:
    print('LOCAL SAVE DOES NOT PRESERVE NEWER SYNC METADATA ATOMICALLY');sys.exit(1)
lock_fn=re.search(r'function updateEditorLocks\(\)\{(.+?)\n\}',app,re.S)
if not lock_fn:
    print('MISSING EDITOR LOCK FUNCTION');sys.exit(1)
for forbidden in ['editorView','querySelectorAll','readOnly','contenteditable']:
    if forbidden in lock_fn.group(1):
        print('EDITOR SURFACE MUST NOT BE MUTATED DURING AUTOSAVE:',forbidden);sys.exit(1)
for marker in ['SIDEBAR_COLLAPSED_KEY','syncEditorStickyOffsets','tableCaptionText','refreshRenderedTableCaption','observeWritingPage','Math.min(1.45','Table caption (optional)']:
    if marker not in app:
        print('MISSING V2.4 EDITOR MARKER:',marker);sys.exit(1)
for marker in ['selectedDocumentIds','sanitizeChapterNumber','documents-select-all','deleteSelectedDocumentsToTrash','updateDocumentBulkBar']:
    if marker not in app:
        print('MISSING V2.4.1 DOCUMENT MARKER:',marker);sys.exit(1)
for marker in ['continueWritingAfterTable','table-continue-button',"pushHistory('Continue after table')","pushHistory('Insert table')"]:
    if marker not in app:
        print('MISSING V2.4.2 CONTINUE-AFTER-TABLE MARKER:',marker);sys.exit(1)
for marker in ['showDocxImportDialog','parseDocxTables','parseWordTable','insertSelectedDocxTables','DOCX table','headerRow!==false','exportStandaloneHtml','embeddedTajawalCss','bindExportMenu','closeExportMenu']:
    if marker not in app:
        print('MISSING V2.4.3 DOCX/EXPORT MARKER:',marker);sys.exit(1)
for marker in ['setRibbonTab','setOutlineDrawerOpen','applyViewOnlyState','openDocumentActionMenu','document-action-menu-panel','data-ribbon-tab="view"']:
    if marker not in app and marker not in html:
        print('MISSING V2.4.4 EDITOR MARKER:',marker);sys.exit(1)
for forbidden in ['outlineDrawerToggle','mobileOutlineToggle']:
    if forbidden in html or forbidden in app:
        print('LEGACY FIXED OUTLINE CONTROL STILL PRESENT:',forbidden);sys.exit(1)
docx_region=app[app.find('async function parseDocxTables'):app.find('// ---------------- Outline/register')]
for marker in ['25*1024*1024','cellCount>5000','columns>50','Merged cells are not supported','Nested table content was flattened','pushHistory(`Import ${imported.length} DOCX table']:
    if marker not in app:
        print('INCOMPLETE V2.4.3 DOCX SAFETY:',marker);sys.exit(1)
html_region=app[app.find('async function exportStandaloneHtml'):app.find('// ---------------- Version history')]
for forbidden in ['<script','supabase','service-role','access_token','refresh_token']:
    if forbidden in html_region.lower():
        print('STANDALONE HTML EXPORT MAY INCLUDE ACTIVE/CLOUD CONTENT:',forbidden);sys.exit(1)

styles=(root/'styles.css').read_text(encoding='utf-8')
for marker in ['Compact document workspace v2.4','editor-ribbon','sidebar-collapsed','outline-drawer-toggle','table-register-header']:
    if marker not in styles:
        print('MISSING V2.4 STYLE MARKER:',marker);sys.exit(1)
for marker in ['Identity, selection and account clarity v2.4.1','password-toggle','document-bulk-bar','selection-box','backup-explainer']:
    if marker not in styles:
        print('MISSING V2.4.1 STYLE MARKER:',marker);sys.exit(1)
for marker in ['Continue after table v2.4.2','table-continue-button','@media print{.table-continue-button{display:none!important}}']:
    if marker not in styles:
        print('MISSING V2.4.2 TABLE STYLE MARKER:',marker);sys.exit(1)
for marker in ['Responsive sign-in and cloud setup v2.4.2','auth-layout','auth-cloud-panel.is-open','auth-cloud-scrim']:
    if marker not in styles:
        print('MISSING V2.4.2 RESPONSIVE AUTH STYLE:',marker);sys.exit(1)
for marker in ['DOCX table import and unified Export v2.4.3','export-menu-panel','docx-dropzone','docx-table-choice','docx-metadata-card']:
    if marker not in styles:
        print('MISSING V2.4.3 DOCX/EXPORT STYLE:',marker);sys.exit(1)
for marker in ['Ribbon tabs, print-faithful view mode and overlay outline v2.4.4','editor-ribbon-tabs','outline-drawer-head','document-action-menu-panel','view-only-mode']:
    if marker not in styles:
        print('MISSING V2.4.4 EDITOR STYLE:',marker);sys.exit(1)
for protected in ['.p-Normal{font-size:11pt', '.p-Heading1{display:flex;gap:7px;align-items:flex-start;font-size:14pt', '.p-Heading2{display:flex;gap:7px;align-items:flex-start;font-size:13pt', '.p-Heading3{font-size:12pt', '.p-Heading4{font-size:11pt', '.p-TableCaption{font-size:9pt', '.mark-NotesToDelete{color:#FF0000;font-weight:700;font-size:9pt', '.mark-HighYield{color:#7030A0;font-weight:700', '.mark-ClinicalCorrelation{color:#39E794']:
    if protected not in styles:
        print('STYLE CONTRACT CHANGED OR MISSING:',protected);sys.exit(1)
workspace_styles=styles.split('/* ===== Compact document workspace v2.4 ===== */',1)[-1]
for forbidden in ['.p-Normal{','.p-Heading1{','.p-Heading2{','.p-Heading3{','.p-Heading4{','.p-TableCaption{','.mark-SideNote{','.mark-NotesToDelete{','.mark-HighYield{','.mark-ClinicalCorrelation{']:
    if forbidden in workspace_styles:
        print('V2.4 LAYOUT MUST NOT OVERRIDE DOCUMENT STYLE:',forbidden);sys.exit(1)

version=(root/'VERSION.json').read_text(encoding='utf-8')
if '"appVersion": "2.4.4"' not in version or "teryaq-master-tool-v2.4.4" not in (root/'sw.js').read_text(encoding='utf-8'):
    print('VERSION/CACHE MISMATCH: expected v2.4.4');sys.exit(1)
for source,versioned in [('app.js','app.v2.4.4.js'),('platform.js','platform.v2.4.4.js'),('styles.css','styles.v2.4.4.css')]:
    if (root/source).read_bytes()!=(root/versioned).read_bytes():
        print('STALE VERSIONED ASSET:',versioned);sys.exit(1)
for ref in ['styles.v2.4.4.css','platform.v2.4.4.js','app.v2.4.4.js','vendor/jszip.min.js']:
    if ref not in html:
        print('MISSING VERSIONED ASSET REFERENCE:',ref);sys.exit(1)
for number in range(1,8):
    if not list((root/'supabase'/'migrations').glob(f'{number:03d}_*.sql')):
        print('MISSING CLOUD MIGRATION:',number);sys.exit(1)
print('Static package checks passed.')
