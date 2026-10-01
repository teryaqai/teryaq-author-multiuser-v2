from pathlib import Path
import re, sys, json

root=Path(__file__).parent
required=[
    'index.html','styles.css','platform.js','app.js',
    'styles.v2.7.3.css','platform.v2.7.3.js','guide.js','guide.v2.7.3.js','workflow.js','workflow.v2.7.3.js','guide.v2.7.3.js','app.v2.7.3.js','submissions.js','submissions.v2.7.3.js',
    'sw.js','manifest.webmanifest','README.md','UPDATE_AND_MIGRATION_POLICY.md',
    'UPLOAD_v2.7.3.md','EDGE_FUNCTIONS_SETUP.md','render.yaml','VERSION.json',
    'supabase/migrations/010_governance_admin_tools.sql',
    'supabase/migrations/011_v2_5_1_profiles_updates.sql',
    'supabase/migrations/012_service_role_profiles_select.sql',
    'supabase/migrations/013_submission_forms_library.sql',
    'supabase/migrations/014_submission_uploads_history.sql',
    'supabase/migrations/015_cloud_version_retention.sql',
    'supabase/migrations/016_submission_backup_locations.sql',
    'supabase/migrations/017_course_workflows.sql',
    'supabase/functions/admin-account-request/index.ts',
    'supabase/functions/admin-governance/index.ts',
    'vendor/jszip.min.js','vendor/JSZip-LICENSE.md','vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs','vendor/PDF.js-LICENSE.txt',
    'fonts/Tajawal-Regular.ttf','fonts/Tajawal-Medium.ttf','fonts/Tajawal-Bold.ttf','icons/default-avatar.svg','icons/teryaq-mark.png','icons/icon-192.png','icons/icon-512.png','icons/ui/course-progress.png','icons/ui/profile.png',
    'icons/ui/documents.svg','icons/ui/success.svg','icons/ui/conflict.svg','icons/ui/sync.svg','icons/ui/updates.svg','icons/ui/guide.svg','icons/ui/draft-figure.png','icons/ui/sync.png','icons/ui/blank-page.png','icons/ui/two-document.png','icons/ui/view.png','icons/ui/list.png','icons/ui/import.png','icons/ui/export.png','icons/ui/sync-cloud.png','icons/ui/notifications.png','icons/ui/settings.png','icons/ui/back.png','icons/ui/dashboard.png','icons/ui/templates.png','icons/ui/trash.png','icons/ui/admin.png','icons/ui/document.png','icons/ui/date.png','icons/ui/bullet-circle.png','icons/ui/bullet-square.png','icons/ui/bullet-rhomboid.png','icons/ui/save.png','icons/ui/conflict.png','icons/ui/analytics.png','icons/ui/users-access.png','icons/ui/audit-log.png','icons/ui/content-setup.png','icons/ui/overview.png','icons/ui/cloud-operations.png','icons/ui/draft-text.png','icons/ui/submission-forms.png','icons/ui/archive.png','icons/ui/text-rtl.svg','icons/ui/text-ltr.svg','icons/ui/drag.png'
]
missing=[x for x in required if not (root/x).exists()]
if missing:
    print('MISSING:',missing);sys.exit(1)

html=(root/'index.html').read_text(encoding='utf-8')
ids=re.findall(r'\bid="([^"]+)"',html)
dups=sorted({x for x in ids if ids.count(x)>1})
if dups:
    print('DUPLICATE IDS:',dups);sys.exit(1)
for x in ['authGate','authPasswordToggle','authCloudToggle','authCloudPanel','authCloudClose','authCloudScrim','authOfflineIdentity','requestAccountBtn','accountRequestModal','accountRequestForm','inviteSetupModal','inviteSetupForm','invitePassword','invitePasswordConfirm','appShell','appSidebar','sidebarCollapse','syncBtn','adminBtn','trashBtn','documentsView','documentBulkBar','bulkDeleteDocuments','clearDocumentSelection','profileView','adminView','notificationsButton','profileMenuButton','dashboardUpdates','leftPanel','editorContentColumn','tableRegister','outlineViewBtn','outlineCloseBtn','outlineScrim','modalBody','appVersionBadge','sidebarAppVersion','exportMenu','exportMenuButton','exportMenuPanel','htmlExportBtn','editorImportBtn','importDocxTableBtn','viewOnlyBtn','underlineBtn','scriptTeleprompter','scriptPromptStage','montageExportBtn','scriptIntroBtn','scriptLightBreakBtn','scriptVisualRefBtn','scriptPresenterBtn','scriptReviewBtn','scriptHeadingBtn','scriptRtlBtn','scriptLtrBtn','scriptAlignLeft','scriptAlignCenter','scriptAlignRight','scriptRepeatBtn','scriptRegion','deleteTableBtn','printPreviewWorkspace','printPreviewPages']:
    if f'id="{x}"' not in html:
        print('MISSING HTML ID:',x);sys.exit(1)

platform=(root/'platform.js').read_text(encoding='utf-8')
for marker in ['AUTO_SYNC_KEY','AUTO_SYNC_INTERVAL_MS','LAST_SYNC_ATTEMPT_KEY','LAST_SYNC_ERROR_KEY','scheduleAutoSync']:
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
for marker in ['getContentOptions','renderAdminContentOptions','content_subjects','content_authors','content_chapters','Automatic Sync: On','Checking other devices']:
    if marker not in platform:
        print('MISSING V2.4.5 DYNAMIC/SYNC MARKER:',marker);sys.exit(1)
for marker in ['admin_save_content_option','Chapters by Course','chapterCourseFilter','Content Options database is not ready']:
    if marker not in platform:
        print('MISSING V2.4.7 CONTENT OPTION MARKER:',marker);sys.exit(1)
for marker in ['Display order','smaller numbers appear first','option-field-order']:
    if marker not in platform:
        print('MISSING V2.4.7 ORDER LABEL:',marker);sys.exit(1)
for marker in ['inviteSessionFromUrl','completeInvitePassword','activateOwnAccountRequest','submitAccountRequest','decideAccountRequest','renderAdminAnalytics','renderAdminConflicts','renderAdminAccountRequests','renderAdminAudit','renderAdminTrash','compareDocumentVersions','showCloudVersions:showAdminVersions','recordAdminEvent']:
    if marker not in platform:
        print('MISSING V2.5.0 GOVERNANCE MARKER:',marker);sys.exit(1)
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
data_changed_region=app[app.find('TeryaqPlatform.setDataChangedCallback'):app.find('TeryaqPlatform.setDataChangedCallback')+700]
for marker in ["['home','documents','templates','trash'].includes(state.view)",'await refreshLibrary()']:
    if marker not in data_changed_region:
        print('ADMIN BACKGROUND-SYNC RERENDER GUARD MISSING:',marker);sys.exit(1)
if 'await refreshLibrary();await renderActiveView()' in data_changed_region:
    print('ADMIN MAY STILL BE REBUILT BY EVERY BACKGROUND SYNC');sys.exit(1)
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
for marker in ['sanitizeNumericCode','deleteTableBtn','renderPrintPreview','applyPreviewScale','bindMetadataCatalogFields','pageView']:
    if marker not in app and marker not in html:
        print('MISSING V2.4.5 EDITOR MARKER:',marker);sys.exit(1)
for marker in ['metaCourse','figMetaCourse','Select a course first','metadata.courseId','Only chapters from the selected course']:
    if marker not in app and marker not in html:
        print('MISSING V2.4.7 COURSE/CHAPTER MARKER:',marker);sys.exit(1)
for marker in ['Cloud versions & compare','TeryaqPlatform.showCloudVersions']:
    if marker not in app:
        print('MISSING V2.5.0 VERSION COMPARISON ENTRY:',marker);sys.exit(1)
for marker in ['UI_ICON_PATHS','renderAuthorPicker','ensureFigureExportReady','mediaQueue','figureUploadSummary','teryaq-media-progress','notificationsButton','profileMenuButton']:
    if marker not in app and marker not in html:
        print('MISSING V2.5.1 UI/MEDIA MARKER:',marker);sys.exit(1)
for marker in ['UI_CUSTOM_ICON_FILES','ui-custom-icon',"success:'success.svg'",'statusMarkup']:
    if marker not in app and marker not in styles:
        print('MISSING V2.5.4 CUSTOM ICON MARKER:',marker);sys.exit(1)
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
for marker in ['v2.4.5 dynamic metadata','print-preview-page','admin-options-grid','sync-always-on']:
    if marker not in styles:
        print('MISSING V2.4.5 STYLE:',marker);sys.exit(1)
for marker in ['v2.4.7 stable Admin forms','chapter-course-heading','chapter-course-chip','option-feedback','option-field-order']:
    if marker not in styles:
        print('MISSING V2.4.7 STYLE:',marker);sys.exit(1)
for marker in ['v2.5.0 governance','account-request-modal','admin-metric-grid','admin-chart-row','version-compare-controls','version-diff-row']:
    if marker not in styles:
        print('MISSING V2.5.0 STYLE:',marker);sys.exit(1)
for marker in ['v2.5.1 floating navigation','topbar-popover','author-check-list','profile-photo-editor','admin-center-shell','figure-upload-progress']:
    if marker not in styles:
        print('MISSING V2.5.1 STYLE:',marker);sys.exit(1)
for protected in ['.p-Normal{font-size:11pt;font-weight:400;font-style:normal', '.p-Heading1{display:flex;gap:7px;align-items:flex-start;font-size:14pt;font-weight:700;font-style:normal', '.p-Heading2{display:flex;gap:7px;align-items:flex-start;font-size:13pt;font-weight:700;font-style:normal', '.p-Heading3{font-size:12pt;font-weight:700;font-style:normal', '.p-Heading4{font-size:11pt;font-weight:400;font-style:italic', '.p-TableCaption{font-size:9pt;font-weight:400;font-style:italic', '.mark-NotesToDelete{color:#FF0000;font-weight:700;font-style:normal;font-size:9pt', '.mark-HighYield{font-size:11pt;font-style:normal;color:#7030A0;font-weight:700', '.mark-ClinicalCorrelation{font-size:11pt;font-weight:400;font-style:normal;color:#39E794']:
    if protected not in styles:
        print('STYLE CONTRACT CHANGED OR MISSING:',protected);sys.exit(1)
for marker in ['applyNamedStyleToRuns','VISUAL_STYLE_MARKS','bullet-rhomboid.png','ui-back-icon']:
    if marker not in app and marker not in styles:
        print('MISSING V2.5.4 STYLE OR ICON:',marker);sys.exit(1)
workspace_styles=styles.split('/* ===== Compact document workspace v2.4 ===== */',1)[-1]
for forbidden in ['.p-Normal{','.p-Heading1{','.p-Heading2{','.p-Heading3{','.p-Heading4{','.p-TableCaption{','.mark-SideNote{','.mark-NotesToDelete{','.mark-HighYield{','.mark-ClinicalCorrelation{']:
    if forbidden in workspace_styles:
        print('V2.4 LAYOUT MUST NOT OVERRIDE DOCUMENT STYLE:',forbidden);sys.exit(1)

version=(root/'VERSION.json').read_text(encoding='utf-8')
if '"appVersion": "2.7.3"' not in version or '"cloudMigrationVersion": 17' not in version or "teryaq-master-tool-v2.7.3" not in (root/'sw.js').read_text(encoding='utf-8'):
    print('VERSION/CACHE MISMATCH: expected v2.7.3 / migration 17');sys.exit(1)
for source,versioned in [('app.js','app.v2.7.3.js'),('platform.js','platform.v2.7.3.js'),('styles.css','styles.v2.7.3.css'),('submissions.js','submissions.v2.7.3.js'),('workflow.js','workflow.v2.7.3.js'),('guide.js','guide.v2.7.3.js')]:
    if (root/source).read_bytes()!=(root/versioned).read_bytes():
        print('STALE VERSIONED ASSET:',versioned);sys.exit(1)
for ref in ['styles.v2.7.3.css','platform.v2.7.3.js','workflow.v2.7.3.js','guide.v2.7.3.js','app.v2.7.3.js','submissions.v2.7.3.js','vendor/jszip.min.js']:
    if ref not in html:
        print('MISSING VERSIONED ASSET REFERENCE:',ref);sys.exit(1)
for number in range(1,18):
    if not list((root/'supabase'/'migrations').glob(f'{number:03d}_*.sql')):
        print('MISSING CLOUD MIGRATION:',number);sys.exit(1)
workflow=(root/'workflow.js').read_text(encoding='utf-8')
migration17=(root/'supabase'/'migrations'/'017_course_workflows.sql').read_text(encoding='utf-8')
for marker in ['id="courseProgressView"','id="courseProgressBody"','data-nav="courseProgress"']:
    if marker not in html:
        print('COURSE PROGRESS NAVIGATION MISSING:',marker);sys.exit(1)
for marker in ['Chapter × stage overview','Progress by stage','Review Requests','workflowSubmission','workflow_admin_edit_task']:
    if marker not in workflow:
        print('COURSE PROGRESS VIEW MISSING:',marker);sys.exit(1)
for marker in ['workflow_submission_guard','workflow_evidence_read','workflow_storage_reviewer_read','workflow_open_ready','workflow_notifications','workflow_admin_edit_task']:
    if marker not in migration17:
        print('COURSE PROGRESS SECURITY MISSING:',marker);sys.exit(1)
match=re.search(r"\('standard-course','Standard course workflow',\s*'(\[.*?\])'::jsonb\)",migration17,re.S)
if not match:
    print('DEFAULT WORKFLOW MISSING');sys.exit(1)
steps=json.loads(match.group(1));seen=set()
for step in steps:
    if step['key'] in seen or any(dep not in seen for dep in step['depends']):
        print('WORKFLOW DEPENDENCY ORDER INVALID:',step['key']);sys.exit(1)
    seen.add(step['key'])
if not {'draft-v5','script-v4','publication'}.issubset(seen) or len(steps)<30:
    print('DRAFT OR SCRIPT WORKFLOW INCOMPLETE');sys.exit(1)
if 'workflow_accounts' not in migration17 or "activeCatalog('accountAuthors')" not in (root/'app.js').read_text(encoding='utf-8'):
    print('TASK AUTHORS MUST COME FROM REGISTERED ACCOUNTS');sys.exit(1)
submissions=(root/'submissions.js').read_text(encoding='utf-8')
migration13=(root/'supabase'/'migrations'/'013_submission_forms_library.sql').read_text(encoding='utf-8')
migration14=(root/'supabase'/'migrations'/'014_submission_uploads_history.sql').read_text(encoding='utf-8')
for marker in ["id:'simplifiedAudit'", "accept:'.html,.htm',required:true,showWhen:{field:'version',equals:'2'}",'uploadSubmissionFile(path,file,','finishSubmission(id,manifest,submissionDetails())']:
    if marker not in submissions:
        print('INCOMPLETE VERSION 2 AUDIT SUBMISSION:',marker);sys.exit(1)
for marker in ["'teryaq-submissions'",'submissions_admin_read','submissions_storage_admin_read','validate_content_submission_trigger']:
    if marker not in migration13:
        print('INCOMPLETE PRIVATE SUBMISSION LIBRARY:',marker);sys.exit(1)
migration9=(root/'supabase'/'migrations'/'009_content_options_repair_course_hierarchy.sql').read_text(encoding='utf-8')
for marker in ['references public.content_subjects(id) on delete restrict','unique (subject_id, chapter_number)','security definer','not public.is_admin(auth.uid())','revoke all on function public.admin_save_content_option','grant execute on function public.admin_save_content_option']:
    if marker not in migration9:
        print('INCOMPLETE V2.4.7 CONTENT OPTION MIGRATION:',marker);sys.exit(1)
migration10=(root/'supabase'/'migrations'/'010_governance_admin_tools.sql').read_text(encoding='utf-8')
for marker in ['create table if not exists public.account_requests','create table if not exists public.audit_log','create table if not exists public.sync_conflicts','submit_account_request','activate_own_account_request','report_sync_conflict','protect_profile_role_change','admin_restore_document','admin_purge_document','record_admin_event','admin_analytics','activity_date','version_count','trash_retention_days','public.is_admin(auth.uid())','grant execute on function public.admin_purge_document(text,uuid) to service_role']:
    if marker not in migration10:
        print('INCOMPLETE V2.5.0 GOVERNANCE MIGRATION:',marker);sys.exit(1)
if "notify pgrst, 'reload schema';" not in migration10.lower():
    print('MISSING POSTGREST SCHEMA CACHE RELOAD');sys.exit(1)
migration11=(root/'supabase'/'migrations'/'011_v2_5_1_profiles_updates.sql').read_text(encoding='utf-8')
for marker in ['avatar_path','create table if not exists public.app_updates','create table if not exists public.app_update_reads','app_updates_admin_insert','app_update_reads_own_insert',"notify pgrst, 'reload schema'"]:
    if marker not in migration11:
        print('INCOMPLETE V2.5.1 PROFILE/UPDATES MIGRATION:',marker);sys.exit(1)
migration12=(root/'supabase'/'migrations'/'012_service_role_profiles_select.sql').read_text(encoding='utf-8')
for marker in ['grant usage on schema public to service_role', 'grant select on table public.profiles to service_role']:
    if marker not in migration12:
        print('INCOMPLETE SERVICE ROLE INVITE REPAIR:', marker);sys.exit(1)
for marker in ['data-ribbon-tab="styles"','data-ribbon-tab="formatting"','data-ribbon-panel="formatting"','data-ui-icon="import"','data-ui-icon="export"']:
    if marker not in html:
        print('MISSING V2.5.5 RIBBON OR ICON:', marker);sys.exit(1)
if 'adminLoadingMarkup(label)' not in platform or '#adminSectionLoading' not in styles or '.export-menu-panel{position:absolute' not in styles:
    print('MISSING V2.5.5 LOADER OR EXPORT ANCHOR');sys.exit(1)
if 'admin-trash-select' not in platform or 'adminPurgeSelected' not in platform or 'eligibleIds' not in platform or 'Retention period has not expired' not in (root/'supabase/functions/admin-governance/index.ts').read_text(encoding='utf-8'):
    print('TRASH SELECTION MUST KEEP THE SERVER RETENTION RULE');sys.exit(1)
for marker in ['uploadPendingAvatar','getUpdates','markAllUpdatesRead','createAppUpdate','deleteAppUpdate','processMediaQueue','createTusUpload','getAttachmentPreview','admin-center-shell']:
    if marker not in platform:
        print('MISSING V2.5.1 PLATFORM MARKER:',marker);sys.exit(1)
edge=(root/'supabase'/'functions'/'admin-account-request'/'index.ts').read_text(encoding='utf-8')
for marker in ['SUPABASE_SERVICE_ROLE_KEY','auth.admin.inviteUserByEmail','normalizedRole',"normalizedRole !== 'admin'",'account_request.approved']:
    if marker not in edge:
        print('INCOMPLETE V2.5.0 ACCOUNT APPROVAL FUNCTION:',marker);sys.exit(1)
governance=(root/'supabase'/'functions'/'admin-governance'/'index.ts').read_text(encoding='utf-8')
for marker in ['SUPABASE_SERVICE_ROLE_KEY',"profile?.role !== 'admin'","action !== 'purge_document'","storage.from('teryaq-author').remove","rpc('admin_purge_document'"]:
    if marker not in governance:
        print('INCOMPLETE V2.5.0 GOVERNANCE FUNCTION:',marker);sys.exit(1)
if 'delete from storage.objects' in migration10.lower():
    print('UNSAFE STORAGE DELETION: use the Storage API, never SQL');sys.exit(1)
for marker in ['drive_uploaded boolean','deleted_at timestamptz','submissions_owner_finish','submissions_admin_update','validate_content_submission','notify pgrst']:
    if marker not in migration14:
        print('INCOMPLETE SUBMISSION HISTORY/TRASH MIGRATION:',marker);sys.exit(1)
for marker in ['uploadSubmissionFile(path,file,{onProgress,signal}','listOwnSubmissions','listTrashedSubmissions','setSubmissionDriveUploaded','trashSubmission','restoreSubmission','purgeTrashedSubmission','selectedContentSetupTab']:
    if marker not in platform:
        print('INCOMPLETE V2.6.2 PLATFORM:',marker);sys.exit(1)
for marker in ['submission-history-card','submission-quality-summary','startFileUpload(fieldId)','orderedSubmissionFiles','renderSubmissionTrash','data-drive-uploaded']:
    if marker not in submissions+styles:
        print('INCOMPLETE V2.6.2 SUBMISSIONS:',marker);sys.exit(1)
for marker in ['copyCurrentOutline','${first}.${second}','script-drag-handle','data-reference-kind="Figure"','insertBodySpaceAfterRepeat']:
    if marker not in app:
        print('INCOMPLETE V2.6.2 EDITOR:',marker);sys.exit(1)
if 'purge_submission' not in governance or 'Retention period has not expired' not in governance:
    print('SUBMISSION RETENTION MUST BE ENFORCED SERVER SIDE');sys.exit(1)
for marker in ['confirmScientificExportVersion','Are you sure about this version?','scientificExportHtmlMetadata','TERYAQ Version ${esc(m.editorialVersion)','exportFigureOnlyPdf()']:
    if marker not in app:
        print('INCOMPLETE EDITOR VERSION CONFIRMATION:',marker);sys.exit(1)
for marker in ['verifySubmissionFileVersion','assertSubmissionVersions','extractPdfVersion','teryaq-editorial-version','تعارض النسخ']:
    if marker not in submissions:
        print('INCOMPLETE DELIVERY VERSION VERIFICATION:',marker);sys.exit(1)

# v2.7.3 safety: cleanup must be explicit, admin-only, version-guarded, and
# independent of push_document. Preview must never enter the upload/submit path.
migration15=(root/'supabase'/'migrations'/'015_cloud_version_retention.sql').read_text(encoding='utf-8')
for marker in ['public.is_admin(auth.uid())','admin_version_storage','admin_prune_document_versions',
               'for update',"newest_rank > 10","interval '90 days'",'version <> doc.current_version',
               'p_expected_current_version','p_expected_eligible','version.history_pruned',
               'grant execute on function public.admin_prune_document_versions(text,bigint,integer) to authenticated']:
    if marker not in migration15:
        print('UNSAFE OR INCOMPLETE CLOUD VERSION RETENTION:',marker);sys.exit(1)
preview=submissions.split('async function previewAdminForm(d)',1)[-1].split('async function refreshAdminContent',1)[0]
if 'disabled aria-label=' not in submissions or 'data-preview-step' not in preview or any(call in preview for call in ['submitForm(', 'ensurePendingSubmission(', 'startFileUpload(', 'validateSection(']):
    print('FORM PREVIEW MUST NOT UPLOAD, SUBMIT, OR REQUIRE FIELDS');sys.exit(1)
if "'shooting-script'].includes(doc?.templateId)" not in app or "if(!isScript()||!await confirmScientificExportVersion(state.current))" not in app or 'icons/ui/drag.png' not in app:
    print('INCOMPLETE SCRIPT VERSION CONFIRMATION OR DRAG ICON');sys.exit(1)
for marker in ['--script-left-border:3px','--script-left-border:4px','--script-left-border:0px','- var(--script-left-border,0px)','padding:0;border:1px solid #dae1dc','.script-drag-icon{display:block;width:11px;height:11px']:
    if marker not in styles:
        print('SCRIPT DRAG HANDLE ALIGNMENT OR ICON CENTERING IS MISSING:',marker);sys.exit(1)
if any(f'id="{name}"' not in html for name in ['blockSelectionToolbar','selectedBlockCount','deleteSelectedBlocksBtn']):
    print('EDITOR SELECTION BAR IS MISSING');sys.exit(1)
for marker in ['selectedBlockIds:new Set()','function hasBlockControls()','scientific-draft-text',"checkbox.setAttribute('role','checkbox')",'function deleteSelectedBlocks()','function moveDocumentBlockTo(','pushHistory(\'Before deleting selected sections\')']:
    if marker not in app:
        print('BLOCK SELECTION, UNDO OR REORDER IS MISSING:',marker);sys.exit(1)
for marker in ['.editor-text-mode .doc-block{position:relative;min-height:0}','.editor-text-mode .block-controls{','flex-direction:row;align-items:center;gap:4px','.editor-text-mode .block-select-box{background:#fff','.editor-text-mode .block-select-box[aria-checked="true"]{background:#294261','width:16px;height:16px','@media print{.editor-text-mode .doc-block{min-height:0!important}']:
    if marker not in styles:
        print('BLOCK CONTROLS MUST BE COMPACT, SINGLE-BOX, AND HIDDEN IN PRINT:',marker);sys.exit(1)
for marker in ['function downloadSubmissionZip(row,button)','orderedSubmissionFiles(row)','new JSZip()','downloadSubmissionFile(file.path)','data-download-zip=','Backup Locations','data-drive-uploaded=']:
    if marker not in submissions:
        print('ARCHIVE ZIP OR BACKUP LOCATION IS MISSING:',marker);sys.exit(1)
if 'data-download-zip' not in submissions.split('function drawLibrary(panel){',1)[1] or '.submission-backup-locations{' not in styles:
    print('ARCHIVE ZIP BUTTON IS UNBOUND OR BACKUP STATUS IS NOT SEPARATE');sys.exit(1)
migration16=(root/'supabase'/'migrations'/'016_submission_backup_locations.sql').read_text(encoding='utf-8')
for marker in ['hard_disk_backup boolean not null default false','telegram_uploaded boolean not null default false','public.is_admin()','guard_submission_backup_locations_trigger','hard_disk_backup_at','telegram_uploaded_at']:
    if marker not in migration16:
        print('BACKUP LOCATION FIELDS MUST BE ADMIN-ONLY AND AUDITED:',marker);sys.exit(1)
for marker in ['drive_backup_url text not null default','hard_disk_backup_details text not null default','telegram_backup_details text not null default','new.drive_backup_url is distinct','new.hard_disk_backup_details is distinct','new.telegram_backup_details is distinct']:
    if marker not in migration16:
        print('BACKUP DETAILS MUST BE STORED AND ADMIN-GUARDED:',marker);sys.exit(1)
for marker in ['setSubmissionBackupLocation','hard_disk_backup,telegram_uploaded']:
    if marker not in platform:
        print('BACKUP STATUS API IS MISSING:',marker);sys.exit(1)
for marker in ['setSubmissionBackupDetails','drive_backup_url,hard_disk_backup_details,telegram_backup_details','Enter an HTTPS Google Drive link']:
    if marker not in platform:
        print('BACKUP DETAILS API IS MISSING:',marker);sys.exit(1)
for marker in ['Backup into Hard-disk','Uploaded to Telegram',"key:'hard_disk'","key:'telegram'",'data-backup-location="${item.key}"','setSubmissionBackupLocation(row.id,box.dataset.backupLocation,box.checked)']:
    if marker not in submissions:
        print('BACKUP LOCATION UI IS MISSING:',marker);sys.exit(1)
for marker in ['Google Drive link','Hard-disk details','Telegram details','data-save-backup-detail=','setSubmissionBackupDetails(row.id,location,value)','driveBackupLink(value)']:
    if marker not in submissions:
        print('BACKUP DETAILS UI IS MISSING:',marker);sys.exit(1)
if 'id="figureOnlyPdfBtn"' in html or "byId('figureOnlyPdfBtn')" in app or '.figure-export-actions{' in styles:
    print('DUPLICATE FIGURES EXPORT BUTTON IS STILL PRESENT');sys.exit(1)
if 'id="figureOnlyExportMenuBtn"' not in html or "byId('figureOnlyExportMenuBtn').onclick" not in app or "setRibbonTab('file')" not in app:
    print('FIGURES FILE RIBBON IS MISSING EXPORT OPTIONS');sys.exit(1)
if '.editor-mode:is(.editor-text-mode,.editor-figure-mode) .app-frame>.topbar>.editor-ribbon' not in styles or '.editor-mode:not(.editor-figure-mode) .figure-only' not in styles:
    print('FIGURES FILE RIBBON IS HIDDEN OR FIGURES OPTION LEAKS INTO OTHER TEMPLATES');sys.exit(1)
for asset in ['vendor/pdf.min.mjs','vendor/pdf.worker.min.mjs']:
    if asset not in (root/'sw.js').read_text(encoding='utf-8'):
        print('PDF VERSION READER MUST BE AVAILABLE OFFLINE:',asset);sys.exit(1)
if 'SUPABASE_SERVICE_ROLE_KEY' in platform or 'service_role' in platform.lower():
    print('SERVICE ROLE KEY MUST NEVER APPEAR IN CLIENT PLATFORM CODE');sys.exit(1)
# v2.7.3 brand, Guide, account-name, and download-location checks.
guide=(root/'guide.js').read_text(encoding='utf-8')
manifest=(root/'manifest.webmanifest').read_text(encoding='utf-8')
sw=(root/'sw.js').read_text(encoding='utf-8')
for marker in ['id="guideRoot"','id="guideSearch"','id="guideSections"','id="guideQuickTasks"','id="guideFeature"']:
    if marker not in html:print('GUIDE UI MISSING:',marker);sys.exit(1)
for marker in ['scientific-draft','shooting-script','submissions','admin-forms','data-guide-lang','data-guide-category','TeryaqGuide']:
    if marker not in guide:print('GUIDE CONTENT/INTERACTION MISSING:',marker);sys.exit(1)
for marker in ['accountNameReady','showRequiredAccountName','requireAccountName']:
    if marker not in app:print('ACCOUNT-NAME GATE MISSING:',marker);sys.exit(1)
for marker in ['downloadFolderInfo','chooseDownloadFolder','downloadBlobToDevice','Set your account name in Profile before importing documents.']:
    if marker not in platform:print('DOWNLOAD FOLDER OR BACKUP NAME GATE MISSING:',marker);sys.exit(1)
if '--brand:#294261' not in styles or '#294261' not in manifest or 'icons/teryaq-mark.png' not in html:
    print('REFERENCE WORKSPACE PALETTE OR LOGO MISSING');sys.exit(1)
if "'log-out':'logout.png'" not in app or 'icons/ui/logout.png' not in sw or not (root/'icons/ui/logout.png').is_file():
    print('SIGN OUT ICON MUST BE AVAILABLE OFFLINE');sys.exit(1)
if 'Workflow Map' not in workflow or 'function mapLayout(list)' not in workflow or 'data-map-task=' not in workflow:
    print('WORKFLOW MAP OR TASK INTERACTION MISSING');sys.exit(1)
if "user:'profile.png'" not in app or 'icons/ui/profile.png' not in sw or 'icons/ui/profile.png' not in platform or 'icons/ui/profile.png' not in html:
    print('PROFILE ICON IS NOT CONSISTENTLY INSTALLED');sys.exit(1)
if "state.selected=available().find(topic=>topic.section===state.category)?.id||state.selected" not in guide:
    print('GUIDE SECTION MUST OPEN ITS FIRST TOPIC');sys.exit(1)
if 'guide.v2.7.3.js' not in sw or 'icons/ui/course-progress.png' not in sw:
    print('NEW GUIDE/ICON MUST BE AVAILABLE OFFLINE');sys.exit(1)
print('Static package checks passed.')
