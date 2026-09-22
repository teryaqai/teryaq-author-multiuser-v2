from pathlib import Path
import re, sys
root=Path(__file__).parent
required=['index.html','styles.css','platform.js','app.js','sw.js','manifest.webmanifest','README.md','UPDATE_AND_MIGRATION_POLICY.md','render.yaml','VERSION.json','fonts/Tajawal-Regular.ttf','fonts/Tajawal-Medium.ttf','fonts/Tajawal-Bold.ttf']
missing=[x for x in required if not (root/x).exists()]
if missing:
    print('MISSING:',missing);sys.exit(1)
html=(root/'index.html').read_text(encoding='utf-8')
ids=re.findall(r'\bid="([^"]+)"',html)
dups=sorted({x for x in ids if ids.count(x)>1})
if dups:
    print('DUPLICATE IDS:',dups);sys.exit(1)
for x in ['authGate','appShell','appSidebar','syncBtn','settingsBtn','adminBtn','trashBtn','documentsView','accountView','adminView','modalBody']:
    if f'id="{x}"' not in html:
        print('MISSING HTML ID:',x);sys.exit(1)
platform=(root/'platform.js').read_text(encoding='utf-8')
for marker in ['AUTO_SYNC_KEY','AUTO_SYNC_INTERVAL_MS','autoSyncToggle','scheduleAutoSync']:
    if marker not in platform:
        print('MISSING AUTO SYNC MARKER:',marker);sys.exit(1)
for marker in ['updateDisplayName','restoreTrashItem','showTrashPage','showAccountPage']:
    if marker not in platform:
        print('MISSING V2.3 MARKER:',marker);sys.exit(1)
for number in range(1,8):
    if not list((root/'supabase'/'migrations').glob(f'{number:03d}_*.sql')):
        print('MISSING CLOUD MIGRATION:',number);sys.exit(1)
print('Static package checks passed.')
