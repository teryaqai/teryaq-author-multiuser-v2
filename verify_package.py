from pathlib import Path
import re, sys

root=Path(__file__).parent
required=[
    'index.html','styles.css','platform.js','app.js',
    'styles.v2.3.3.css','platform.v2.3.3.js','app.v2.3.3.js',
    'sw.js','manifest.webmanifest','README.md','UPDATE_AND_MIGRATION_POLICY.md',
    'AI_REVIEW_BRIEF.md','render.yaml','VERSION.json',
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
for x in ['authGate','appShell','appSidebar','syncBtn','settingsBtn','adminBtn','trashBtn','documentsView','accountView','adminView','modalBody','appVersionBadge','sidebarAppVersion']:
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

app=(root/'app.js').read_text(encoding='utf-8')
for marker in ['EMERGENCY_DRAFT_PREFIX','saveAndSyncCurrent','pagehide','beforeunload','cloud version','localSaveToken','requestPersistentStorage','appVersionBadge']:
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
lock_fn=re.search(r'function updateEditorLocks\(\)\{(.+?)\n\}',app,re.S)
if not lock_fn:
    print('MISSING EDITOR LOCK FUNCTION');sys.exit(1)
for forbidden in ['editorView','querySelectorAll','readOnly','contenteditable']:
    if forbidden in lock_fn.group(1):
        print('EDITOR SURFACE MUST NOT BE MUTATED DURING AUTOSAVE:',forbidden);sys.exit(1)

version=(root/'VERSION.json').read_text(encoding='utf-8')
if '"appVersion": "2.3.3"' not in version or "teryaq-master-tool-v2.3.3" not in (root/'sw.js').read_text(encoding='utf-8'):
    print('VERSION/CACHE MISMATCH: expected v2.3.3');sys.exit(1)
for source,versioned in [('app.js','app.v2.3.3.js'),('platform.js','platform.v2.3.3.js'),('styles.css','styles.v2.3.3.css')]:
    if (root/source).read_bytes()!=(root/versioned).read_bytes():
        print('STALE VERSIONED ASSET:',versioned);sys.exit(1)
for ref in ['styles.v2.3.3.css','platform.v2.3.3.js','app.v2.3.3.js']:
    if ref not in html:
        print('MISSING VERSIONED ASSET REFERENCE:',ref);sys.exit(1)
for number in range(1,8):
    if not list((root/'supabase'/'migrations').glob(f'{number:03d}_*.sql')):
        print('MISSING CLOUD MIGRATION:',number);sys.exit(1)
print('Static package checks passed.')
