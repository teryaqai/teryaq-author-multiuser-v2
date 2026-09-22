/* TERYAQ Master Tool Offline App
   Local-first, dependency-free PWA prototype.
   Document data is structured JSON; the DOM is only the editor surface. */
(() => {
'use strict';

const APP_VERSION = '2.4.1';
const SCHEMA_VERSION = '2.0.0';
const DB_NAME = 'TeryaqAuthorDB';
const DB_VERSION = 3;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_HISTORY = 120;
const EMERGENCY_DRAFT_PREFIX = 'teryaq:emergency-draft:';
const SIDEBAR_COLLAPSED_KEY = 'teryaq:sidebar-collapsed';

const STYLE_CONTRACT = {
  Normal:{label:'Body',size:11},
  Heading1:{label:'H1',size:14,bold:true,color:'#C45911'},
  Heading2:{label:'H2',size:13,bold:true,color:'#538135'},
  Heading3:{label:'H3',size:12,bold:true,color:'#2E74B5'},
  Heading4:{label:'H4',size:11,italic:true,color:'#2F5496'},
  Subtitle:{label:'Side Q/A',size:11,color:'#7F7F7F'},
  TableCaption:{label:'Table Caption',size:9,italic:true,color:'#767171'},
  SideNote:{label:'Side Note',color:'#BF8F00'},
  NotesToDelete:{label:'Note to Delete',size:9,bold:true,color:'#FF0000'},
  HighYield:{label:'High-Yield',size:11,bold:true,underline:true,color:'#7030A0'},
  ClinicalCorrelation:{label:'Clinical Correlation',size:11,color:'#39E794'},
  FigurePlaceholder:{highlight:'#FFED29'},
  BulletLevels:{1:{marker:'●',indentPt:26},2:{marker:'■',indentPt:44},3:{marker:'◆',indentPt:62}}
};

const BUILTIN_TEMPLATES = [
  {
    id:'scientific-draft-text', version:'1.0.0', name:'Scientific Draft - Text Content', category:'Scientific Content', editor:'rich-document',
    informationTitle:'Draft information',
    description:'Structured scientific drafting with Word-mapped styles, headings, figures, tables, validation and A4 output.',
    newDocument(){ return createTextDocument(); }
  },
  {
    id:'scientific-draft-figures', version:'1.0.0', name:'Scientific Draft - Figures', category:'Scientific Content', editor:'structured-form',
    informationTitle:'Draft information',
    description:'Figure request workflow with five outcomes, source/copyright fields, instructions and quick figure navigation.',
    newDocument(){ return createFigureDocument(); }
  }
];

const state = {
  db:null, view:'home', docs:[], customTemplates:[], current:null, dirty:false,
  activeBlockId:null, activeTableId:null, activeCell:null, selectionBookmark:null,
  history:[], historyIndex:-1, typingTimer:null, saveTimer:null, lastSnapshotAt:0,
  suppressHistory:false, search:'', editRevision:0, savedRevision:0,
  saveChain:Promise.resolve(true), saveInFlight:0, blockingSaveInFlight:0, syncInFlight:false,
  pageResizeObserver:null, selectedDocumentIds:new Set()
};

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const byId = id => document.getElementById(id);
const clone = obj => JSON.parse(JSON.stringify(obj));
const nowIso = () => new Date().toISOString();
const uid = (prefix='id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const UI_ICON_PATHS={documents:'<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>',text:'<path d="M5 3h14v18H5z"/><path d="M9 8h6M9 12h6M9 16h4"/>',sync:'<path d="M20 7h-5V2"/><path d="M4 17h5v5"/><path d="M19 12a7 7 0 0 0-12-5l-2 2M5 12a7 7 0 0 0 12 5l2-2"/>',conflict:'<path d="M12 3 2 21h20z"/><path d="M12 9v5M12 18h.01"/>',local:'<path d="M4 6h16v12H4z"/><path d="M8 22h8M12 18v4"/>',figure:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/>'};
function uiIcon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${UI_ICON_PATHS[name]||UI_ICON_PATHS.documents}</svg>`}

function toast(msg){ const el=byId('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),1800); }
function setSaveStatus(text){ const el=byId('saveStatus'); if(el) el.textContent=text; }
function updateEditorLocks(){
  const saving=state.saveInFlight>0,busy=state.blockingSaveInFlight>0||state.syncInFlight;
  for(const id of ['saveBtn','syncBtnEditor','backBtn','settingsBtnEditor','validateBtn','historyBtn','backupBtn','saveTemplateBtn','printBtn']){const button=byId(id);if(button)button.disabled=busy}
  const save=byId('saveBtn');if(save)save.textContent=saving?'Saving…':state.syncInFlight?'Sending…':'Save';
}
function fmtDate(iso){ if(!iso)return ''; try{return new Date(iso).toLocaleString();}catch{return iso;} }
function fileSafe(s){ return String(s||'Teryaq_Document').trim().replace(/[^\w\-]+/g,'_').replace(/_+/g,'_').slice(0,80) || 'Teryaq_Document'; }
function sanitizeChapterNumber(value){
  const arabic='٠١٢٣٤٥٦٧٨٩',persian='۰۱۲۳۴۵۶۷۸۹';
  return String(value??'').replace(/[٠-٩]/g,c=>String(arabic.indexOf(c))).replace(/[۰-۹]/g,c=>String(persian.indexOf(c))).replace(/[^0-9.]/g,'');
}

// ---------------- IndexedDB ----------------
function openDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result, upgradeTx=req.transaction;
      let s;
      if(!db.objectStoreNames.contains('documents')){s=db.createObjectStore('documents',{keyPath:'id'});s.createIndex('updatedAt','updatedAt');s.createIndex('templateId','templateId');s.createIndex('ownerId','ownerId');}
      else {s=upgradeTx.objectStore('documents');if(!s.indexNames.contains('ownerId'))s.createIndex('ownerId','ownerId');}
      if(!db.objectStoreNames.contains('snapshots')){s=db.createObjectStore('snapshots',{keyPath:'id'});s.createIndex('documentId','documentId');s.createIndex('createdAt','createdAt');s.createIndex('ownerId','ownerId');}
      else {s=upgradeTx.objectStore('snapshots');if(!s.indexNames.contains('ownerId'))s.createIndex('ownerId','ownerId');}
      if(!db.objectStoreNames.contains('templates')){s=db.createObjectStore('templates',{keyPath:'id'});s.createIndex('ownerId','ownerId');}
      else {s=upgradeTx.objectStore('templates');if(!s.indexNames.contains('ownerId'))s.createIndex('ownerId','ownerId');}
      if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});
      if(!db.objectStoreNames.contains('accounts'))db.createObjectStore('accounts',{keyPath:'id'});
      if(!db.objectStoreNames.contains('devices')){s=db.createObjectStore('devices',{keyPath:'id'});s.createIndex('ownerId','ownerId');}
      if(!db.objectStoreNames.contains('syncQueue')){s=db.createObjectStore('syncQueue',{keyPath:'id'});s.createIndex('ownerId','ownerId');}
      if(!db.objectStoreNames.contains('tombstones')){s=db.createObjectStore('tombstones',{keyPath:'id'});s.createIndex('ownerId','ownerId');}
      if(!db.objectStoreNames.contains('trash')){s=db.createObjectStore('trash',{keyPath:'id'});s.createIndex('ownerId','ownerId');s.createIndex('deletedAt','deletedAt');}
      if(!db.objectStoreNames.contains('conflicts')){s=db.createObjectStore('conflicts',{keyPath:'id'});s.createIndex('ownerId','ownerId');}
      if(!db.objectStoreNames.contains('migrationBackups')){s=db.createObjectStore('migrationBackups',{keyPath:'id'});s.createIndex('ownerId','ownerId');s.createIndex('createdAt','createdAt');}
    };
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
function tx(store,mode='readonly'){return state.db.transaction(store,mode).objectStore(store)}
function idbPut(store,val){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(val);r.onsuccess=()=>res(val);r.onerror=()=>rej(r.error)})}
function idbGet(store,key){return new Promise((res,rej)=>{const r=tx(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function idbDelete(store,key){return new Promise((res,rej)=>{const r=tx(store,'readwrite').delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function idbAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function idbByIndex(store,index,key){return new Promise((res,rej)=>{const r=tx(store).index(index).getAll(key);r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function idbPutDocumentPreservingSync(document){
  return new Promise((resolve,reject)=>{
    const transaction=state.db.transaction('documents','readwrite'),store=transaction.objectStore('documents');let saved=null,failure=null;
    const request=store.get(document.id);
    request.onsuccess=()=>{try{
      const existing=request.result,next=clone(document),existingBase=Number(existing?.sync?.baseServerVersion||0),nextBase=Number(next.sync?.baseServerVersion||0);
      next.sync={...(next.sync||{}),baseServerVersion:Math.max(existingBase,nextBase)};
      if(existingBase>nextBase&&existing?.sync?.lastSyncedAt)next.sync.lastSyncedAt=existing.sync.lastSyncedAt;
      if(existing?.sync?.status==='conflict')next.sync={...next.sync,status:'conflict',baseServerVersion:Math.max(existingBase,nextBase),lastError:existing.sync.lastError||'Sync conflict needs review.'};
      store.put(next);saved=next
    }catch(error){failure=error;transaction.abort()}};
    transaction.oncomplete=()=>resolve(saved);transaction.onerror=()=>reject(failure||transaction.error);transaction.onabort=()=>reject(failure||transaction.error||new Error('Local save transaction aborted'))
  })
}

// ---------------- Models ----------------
function blankMeta(){ return {name:'',startDate:'',endDate:'',subject:'',chapterNumber:'',chapterTitle:'',generalNotes:''}; }
function normalBlock(text=''){ return {id:uid('b'),type:'paragraph',style:'Normal',runs:text?[{text,marks:[]}]:[]}; }
function createTextDocument(){
  const t=BUILTIN_TEMPLATES[0];
  return {id:uid('doc'),format:'TeryaqDocument',schemaVersion:SCHEMA_VERSION,appVersion:APP_VERSION,templateId:t.id,templateVersion:t.version,title:'Untitled Scientific Draft',createdAt:nowIso(),updatedAt:nowIso(),metadata:blankMeta(),content:{blocks:[normalBlock()]},settings:{}};
}
function createFigureDocument(){
  const t=BUILTIN_TEMPLATES[1];
  return {id:uid('doc'),format:'TeryaqDocument',schemaVersion:SCHEMA_VERSION,appVersion:APP_VERSION,templateId:t.id,templateVersion:t.version,title:'Untitled Figures Draft',createdAt:nowIso(),updatedAt:nowIso(),metadata:{name:'',subject:'',chapterNumber:'',chapterTitle:'',generalNotes:''},content:{figures:[blankFigure()]},settings:{}};
}
function blankFigure(){return {id:uid('fig'),code:'',title:'',caption:'',source:'',order:'',details:'',copyright:'',notes:'',image:''}}
function getTemplate(id){return BUILTIN_TEMPLATES.find(t=>t.id===id)||state.customTemplates.find(t=>t.id===id)}

// ---------------- Inline structured runs ----------------
const MARK_CLASS = {SideNote:'mark-SideNote',NotesToDelete:'mark-NotesToDelete',HighYield:'mark-HighYield',ClinicalCorrelation:'mark-ClinicalCorrelation'};
function normalizeRuns(runs){
  const out=[];
  for(const r of (runs||[])){
    if(!r || !r.text) continue;
    const marks=[...(r.marks||[])].sort();
    const prev=out[out.length-1];
    if(prev && JSON.stringify(prev.marks)===JSON.stringify(marks)) prev.text+=r.text; else out.push({text:r.text,marks});
  }
  return out;
}
function runsToHtml(runs){
  return normalizeRuns(runs).map(r=>{
    let h=esc(r.text).replace(/\n/g,'<br>');
    const marks=r.marks||[];
    if(marks.includes('bold')) h=`<strong>${h}</strong>`;
    if(marks.includes('italic')) h=`<em>${h}</em>`;
    for(const m of ['SideNote','NotesToDelete','HighYield','ClinicalCorrelation']) if(marks.includes(m)) h=`<span class="${MARK_CLASS[m]}" data-mark="${m}">${h}</span>`;
    const fs=marks.find(x=>x.startsWith('font:')); if(fs){const n=parseFloat(fs.split(':')[1]);if(n)h=`<span data-font-size="${n}" style="font-size:${n}pt">${h}</span>`;}
    return h;
  }).join('');
}
function elementToRuns(el){
  const out=[];
  function walk(node,marks){
    if(node.nodeType===Node.TEXT_NODE){ if(node.nodeValue) out.push({text:node.nodeValue,marks:[...marks]}); return; }
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    const tag=node.tagName.toLowerCase(); const next=[...marks];
    if(tag==='strong'||tag==='b')next.push('bold'); if(tag==='em'||tag==='i')next.push('italic');
    const dm=node.dataset?.mark;if(dm&&MARK_CLASS[dm])next.push(dm);
    const fs=node.dataset?.fontSize;if(fs)next.push(`font:${fs}`);
    if(tag==='br'){out.push({text:'\n',marks:[...marks]});return;}
    [...node.childNodes].forEach(c=>walk(c,next));
  }
  [...el.childNodes].forEach(c=>walk(c,[])); return normalizeRuns(out);
}
function plainText(runs){return (runs||[]).map(r=>r.text).join('')}
function textDirection(text){
  const firstStrong=String(text||'').match(/[A-Za-z\u00C0-\u02AF\u0370-\u052F\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/u)?.[0]||'';
  return /[\u0590-\u08FF\uFB1D-\uFDFD\uFE70-\uFEFC]/u.test(firstStrong)?'rtl':'ltr';
}
function applyBlockDirection(el,text){
  const direction=textDirection(text);el.setAttribute('dir',direction);const editable=el.matches?.('.editable')?el:el.querySelector?.('.editable');if(editable)editable.setAttribute('dir',direction);return direction;
}
function splitRuns(runs,offset){
  const left=[],right=[];let pos=0;
  for(const r of runs||[]){const end=pos+r.text.length;if(offset<=pos)right.push(clone(r));else if(offset>=end)left.push(clone(r));else{const cut=offset-pos;if(cut)left.push({text:r.text.slice(0,cut),marks:[...(r.marks||[])]});if(cut<r.text.length)right.push({text:r.text.slice(cut),marks:[...(r.marks||[])]});}pos=end;}
  return [normalizeRuns(left),normalizeRuns(right)];
}

// ---------------- App bootstrap ----------------
async function boot(){
  state.db=await openDb();
  TeryaqPlatform.attachDb(state.db);
  TeryaqPlatform.setDataChangedCallback(async()=>{if(TeryaqPlatform.user()){await refreshLibrary();await renderActiveView();}});
  for(const id of ['appVersionBadge','sidebarAppVersion']){const el=byId(id);if(el)el.textContent=`v${APP_VERSION}`}
  bindGlobal();
  applySidebarPreference();
  const auth=await TeryaqPlatform.initialize();
  window.addEventListener('teryaq-authenticated',async()=>{await afterAuthentication();});
  if(auth.authenticated)await afterAuthentication();
  window.addEventListener('resize',()=>{syncEditorStickyOffsets();if(state.current?.templateId==='scientific-draft-text')updatePageScale()});
  window.addEventListener('pagehide',flushEmergencySave);
  window.addEventListener('teryaq-document-rekeyed',event=>{
    const detail=event.detail;if(!detail?.document)return;
    if(state.current?.id===detail.oldId){clearEmergencyDraft(detail.oldId);state.current=clone(detail.document);state.dirty=false;state.editRevision++;state.savedRevision=state.editRevision;setSaveStatus('Ownership repaired safely · syncing new document ID…');toast('Document ownership repaired safely')}
    else if(state.current?.id===detail.document.id){state.current.sync=clone(detail.document.sync||state.current.sync||{});if(detail.document.sync?.status==='synced')setSaveStatus(`Saved locally ✓ · cloud version ${Number(detail.document.sync.baseServerVersion||1)} ✓`)}
  });
  window.addEventListener('teryaq-document-sync-metadata',event=>{
    const detail=event.detail;if(!detail?.documentId||state.current?.id!==detail.documentId)return;
    const incoming=detail.sync||{},current=state.current.sync||{},hasNewerUnsaved=state.dirty||state.saveInFlight>0;
    state.current.sync={...current,...clone(incoming),baseServerVersion:Math.max(Number(current.baseServerVersion||0),Number(incoming.baseServerVersion||0))};
    if(hasNewerUnsaved&&state.current.sync.status==='synced')state.current.sync.status='pending'
  });
  window.addEventListener('teryaq-remote-document-applied',event=>{
    const document=event.detail?.document;if(!document||state.current?.id!==document.id||state.dirty||state.saveInFlight>0)return;
    state.current=clone(document);state.editRevision=0;state.savedRevision=0;resetHistory();renderEditor();pushHistory('Cloud refresh');setSaveStatus(`Cloud version ${Number(document.sync?.baseServerVersion||0)} loaded ✓`)
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushEmergencySave()});
  window.addEventListener('beforeunload',event=>{
    if(!state.current||(state.dirty===false&&state.saveInFlight===0))return;
    persistEmergencyDraft(state.current,state.editRevision);
    if(state.dirty)void saveCurrent(false);
    event.preventDefault();event.returnValue='';
  });
  setInterval(()=>{if(state.current && state.dirty && Date.now()-state.lastSnapshotAt>SNAPSHOT_INTERVAL_MS)createSnapshot('Auto snapshot')},60000);
}
async function afterAuthentication(){
  await requestPersistentStorage();await TeryaqPlatform.claimAndMigrateLegacyData();const recovered=await recoverEmergencyDrafts();await refreshLibrary();renderHome();TeryaqPlatform.updateSyncUi();
  if(recovered)toast(`Recovered ${recovered} emergency draft${recovered===1?'':'s'}`);
  if(navigator.onLine)TeryaqPlatform.syncNow({silent:true});
}
async function requestPersistentStorage(){
  try{
    if(!navigator.storage?.persist)return false;
    const already=await navigator.storage.persisted?.();const granted=already||await navigator.storage.persist();
    try{localStorage.setItem('teryaq:storage-persistence',granted?'granted':'best-effort')}catch(_){}
    return granted
  }catch(error){console.warn('Persistent storage request unavailable:',error);return false}
}
async function refreshLibrary(){
  const u=TeryaqPlatform.user();if(!u){state.docs=[];state.customTemplates=[];return}
  state.docs=(await idbAll('documents')).filter(d=>d.ownerId===u.id).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  state.customTemplates=(await idbAll('templates')).filter(t=>t.ownerId===u.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
function bindGlobal(){
  byId('homeBtn').onclick=()=>goHome();byId('backBtn').onclick=()=>goHome();byId('newDocumentBtn').onclick=()=>showNewDocumentWizard();byId('documentsNewBtn').onclick=()=>showNewDocumentWizard();byId('importBtn').onclick=()=>byId('importFile').click(); byId('importFile').onchange=e=>e.target.files[0]&&importPackage(e.target.files[0]);
  byId('searchDocs').addEventListener('input',e=>{state.search=e.target.value.toLowerCase();state.selectedDocumentIds.clear();renderDocuments()});
  byId('documentStatusFilter').addEventListener('change',()=>{state.selectedDocumentIds.clear();renderDocuments()});
  byId('globalSearch').addEventListener('input',e=>{state.search=e.target.value.toLowerCase();byId('searchDocs').value=e.target.value;activateView('documents')});
  byId('guideSearch').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();let visible=0;$$('.guide-topic').forEach(card=>{card.hidden=!!(q&&!card.textContent.toLowerCase().includes(q));if(!card.hidden){visible++;if(q)card.open=true}});byId('guideEmpty').classList.toggle('hidden',visible>0)});
  $$('[data-guide-target]').forEach(button=>button.addEventListener('click',()=>{const section=byId(button.dataset.guideTarget);if(section){section.hidden=false;section.open=true;section.scrollIntoView({behavior:'smooth',block:'start'})}}));
  byId('closeValidation').onclick=()=>byId('validationPanel').classList.add('hidden');
  byId('closeModal').onclick=()=>{byId('modal').classList.add('hidden');byId('modal').querySelector('.modal-card')?.classList.remove('wizard-modal')};
  byId('syncBtn').onclick=()=>TeryaqPlatform.syncNow();
  byId('resolveConflictsBtn').onclick=()=>TeryaqPlatform.resolveConflicts();
  byId('bulkDeleteDocuments').onclick=()=>deleteSelectedDocumentsToTrash();byId('clearDocumentSelection').onclick=()=>{state.selectedDocumentIds.clear();renderDocuments()};
  $$('[data-nav]').forEach(button=>button.addEventListener('click',()=>activateView(button.dataset.nav)));
  byId('sidebarToggle').onclick=()=>setSidebarOpen(true);byId('sidebarClose').onclick=()=>setSidebarOpen(false);byId('sidebarScrim').onclick=()=>setSidebarOpen(false);byId('sidebarCollapse').onclick=()=>setSidebarCollapsed(!byId('appShell').classList.contains('sidebar-collapsed'));
}

// ---------------- Home/library ----------------
function setSidebarOpen(open){byId('appShell').classList.toggle('sidebar-open',open);byId('sidebarScrim').classList.toggle('hidden',!open)}
function applySidebarPreference(){let collapsed=true;try{const saved=localStorage.getItem(SIDEBAR_COLLAPSED_KEY);if(saved!==null)collapsed=saved==='true'}catch(_){}setSidebarCollapsed(collapsed,false)}
function setSidebarCollapsed(collapsed,persist=true){const shell=byId('appShell'),button=byId('sidebarCollapse');if(!shell||!button)return;shell.classList.toggle('sidebar-collapsed',collapsed);button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');button.title=collapsed?'Expand sidebar':'Collapse sidebar';if(persist)try{localStorage.setItem(SIDEBAR_COLLAPSED_KEY,String(collapsed))}catch(_){}requestAnimationFrame(()=>{syncEditorStickyOffsets();if(state.current?.templateId==='scientific-draft-text')updatePageScale()})}
function syncEditorStickyOffsets(){const topbar=document.querySelector('.app-frame>.topbar'),ribbon=byId('leftPanel');if(topbar)document.documentElement.style.setProperty('--topbar-height',`${Math.ceil(topbar.getBoundingClientRect().height)}px`);requestAnimationFrame(()=>{if(ribbon&&!ribbon.classList.contains('hidden'))document.documentElement.style.setProperty('--editor-ribbon-height',`${Math.ceil(ribbon.getBoundingClientRect().height)}px`)})}
async function activateView(name){
  if(state.current&&name!=='editor'&&!(await ensureCurrentSaved()))return false;
  if(name!=='editor')state.current=null;
  state.view=name;byId('appShell').classList.toggle('editor-mode',name==='editor');$$('.view').forEach(v=>v.classList.remove('active'));const view=byId(`${name}View`);if(view)view.classList.add('active');
  $$('.sidebar-link[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===name));byId('editorActions').classList.toggle('hidden',name!=='editor');byId('homeActions').classList.toggle('hidden',name==='editor');byId('backBtn').classList.toggle('hidden',name!=='editor');setSidebarOpen(false);
  if(name!=='editor'){byId('docTitle').textContent=name==='home'?'TERYAQ Master Tool':name[0].toUpperCase()+name.slice(1);await renderActiveView()}requestAnimationFrame(syncEditorStickyOffsets);
  return true;
}
async function renderActiveView(){
  if(state.view==='home'){renderDashboard();renderDocuments()}
  else if(state.view==='documents')renderDocuments();
  else if(state.view==='templates')renderTemplatesPage();
  else if(state.view==='trash')await TeryaqPlatform.showTrashPage('trashPageBody');
  else if(state.view==='settings')await TeryaqPlatform.showSettingsPage('settingsPageBody');
  else if(state.view==='account')await TeryaqPlatform.showAccountPage('accountPageBody');
  else if(state.view==='admin')await TeryaqPlatform.showAdminDashboard('overview','adminPageBody');
}
function renderHome(){
  const u=TeryaqPlatform.user();byId('welcomeEmail').textContent=u?.displayName?.trim()||u?.email||'';activateView('home');
}
function renderDashboard(){
  const u=TeryaqPlatform.user(),docs=state.docs,pending=docs.filter(d=>['pending','local-only'].includes(d.sync?.status)).length,conflicts=docs.filter(d=>d.sync?.status==='conflict').length;
  byId('welcomeEmail').textContent=u?.displayName?.trim()||u?.email||'';
  byId('dashboardStats').innerHTML=`<article class="stat-card"><span class="stat-icon">${uiIcon('documents')}</span><div><b>${docs.length}</b><small>Documents</small></div></article><article class="stat-card indigo"><span class="stat-icon">${uiIcon('text')}</span><div><b>${docs.filter(d=>d.templateId==='scientific-draft-text').length}</b><small>Text drafts</small></div></article><article class="stat-card gold"><span class="stat-icon">${uiIcon('sync')}</span><div><b>${pending}</b><small>Waiting sync</small></div></article><article class="stat-card wine"><span class="stat-icon">${uiIcon('conflict')}</span><div><b>${conflicts}</b><small>Conflicts</small></div></article>`;
  const host=byId('dashboardTemplates');host.innerHTML='';BUILTIN_TEMPLATES.forEach(t=>{const card=document.createElement('article');card.className='quick-template';card.innerHTML=`<span class="template-icon">${uiIcon(t.editor==='structured-form'?'figure':'text')}</span><div><h4>${esc(t.name)}</h4><p>${esc(t.description)}</p></div><button class="btn small primary">Use</button>`;card.querySelector('button').onclick=()=>showNewDocumentWizard(t.id);host.appendChild(card)})
}
function renderDocuments(){
  let docs=state.docs;
  if(state.search)docs=docs.filter(d=>JSON.stringify([d.title,d.metadata?.subject,d.metadata?.chapterTitle,d.metadata?.chapterNumber]).toLowerCase().includes(state.search));
  const status=state.view==='documents'?(byId('documentStatusFilter')?.value||''):'';if(status)docs=docs.filter(d=>(d.sync?.status||'local-only')===status);
  const visibleIds=new Set(docs.map(d=>d.id));state.selectedDocumentIds=new Set([...state.selectedDocumentIds].filter(id=>visibleIds.has(id)));
  const cardHost=byId('documentCards');if(cardHost){cardHost.innerHTML='';const recent=docs.slice(0,4);if(!recent.length)cardHost.innerHTML='<div class="empty-state"><b>No saved documents yet.</b><br>Create your first document from a template.</div>';recent.forEach(d=>cardHost.appendChild(documentCard(d)))}
  const stats=byId('documentStats');if(stats)stats.innerHTML=`<article class="stat-card"><span class="stat-icon">${uiIcon('documents')}</span><div><b>${state.docs.length}</b><small>Active</small></div></article><article class="stat-card gold"><span class="stat-icon">${uiIcon('sync')}</span><div><b>${state.docs.filter(d=>d.sync?.status==='pending').length}</b><small>Waiting sync</small></div></article><article class="stat-card wine"><span class="stat-icon">${uiIcon('conflict')}</span><div><b>${state.docs.filter(d=>d.sync?.status==='conflict').length}</b><small>Conflicts</small></div></article><article class="stat-card indigo"><span class="stat-icon">${uiIcon('local')}</span><div><b>${state.docs.filter(d=>d.sync?.status==='local-only').length}</b><small>Local only</small></div></article>`;
  updateDocumentBulkBar();const table=byId('documentsTable');if(!table)return;if(!docs.length){table.innerHTML='<div class="empty-state">No documents match these filters.</div>';return}const allSelected=docs.every(d=>state.selectedDocumentIds.has(d.id));table.innerHTML=`<table class="documents-table"><thead><tr><th class="select-col"><label class="selection-box" title="Select all visible documents"><input type="checkbox" class="documents-select-all" aria-label="Select all visible documents" ${allSelected?'checked':''}><span></span></label></th><th>Document</th><th>Template</th><th>Edited</th><th>Status</th><th>Actions</th></tr></thead><tbody>${docs.map(d=>`<tr data-doc-id="${esc(d.id)}" class="${state.selectedDocumentIds.has(d.id)?'selected-row':''}"><td class="select-col"><label class="selection-box"><input type="checkbox" class="document-select" aria-label="Select ${esc(d.title||'document')}" ${state.selectedDocumentIds.has(d.id)?'checked':''}><span></span></label></td><td class="doc-main"><b>${esc(d.title||'Untitled')}</b><small>${esc(d.metadata?.subject||'No subject')}</small></td><td>${esc(getTemplate(d.templateId)?.name||d.templateId)}</td><td>${esc(fmtDate(d.updatedAt))}</td><td><button class="chip sync-chip ${esc(d.sync?.status||'local-only')} row-status">${esc(d.sync?.status||'local-only')}</button></td><td><div class="row-actions"><button class="btn primary small row-open">Open</button><button class="btn small row-history">History & Versions</button><details class="more-menu"><summary class="btn small">•••</summary><div class="more-popover"><button class="row-duplicate">Duplicate</button><button class="row-export">Export .teryaq</button><button class="row-delete danger">Move to Trash</button></div></details></div></td></tr>`).join('')}</tbody></table>`;
  const selectAll=table.querySelector('.documents-select-all');selectAll.indeterminate=!allSelected&&state.selectedDocumentIds.size>0;selectAll.onchange=()=>{if(selectAll.checked)docs.forEach(d=>state.selectedDocumentIds.add(d.id));else docs.forEach(d=>state.selectedDocumentIds.delete(d.id));renderDocuments()};
  table.querySelectorAll('tr[data-doc-id]').forEach(row=>{const d=state.docs.find(x=>x.id===row.dataset.docId);row.querySelector('.document-select').onchange=e=>{if(e.target.checked)state.selectedDocumentIds.add(d.id);else state.selectedDocumentIds.delete(d.id);renderDocuments()};row.querySelector('.row-open').onclick=()=>openDocument(d.id);row.querySelector('.row-history').onclick=async()=>{await openDocument(d.id);showSnapshots()};row.querySelector('.row-status').onclick=()=>d.sync?.status==='conflict'&&TeryaqPlatform.resolveConflicts(d.id);row.querySelector('.row-duplicate').onclick=()=>duplicateDocument(d.id);row.querySelector('.row-export').onclick=()=>exportDocumentPackage(d);row.querySelector('.row-delete').onclick=()=>deleteDocumentToTrash(d)})
}
function updateDocumentBulkBar(){const bar=byId('documentBulkBar'),count=state.selectedDocumentIds.size;if(!bar)return;bar.classList.toggle('hidden',!count);byId('selectedDocumentCount').textContent=`${count} selected`}
function documentCard(d){const t=getTemplate(d.templateId),hasConflict=d.sync?.status==='conflict',card=document.createElement('div');card.className=`doc-card${hasConflict?' has-conflict':''}`;card.innerHTML=`${hasConflict?'<div class="document-conflict-alert"><b>Sync conflict / تعارض مزامنة</b><span>Review this document before continuing.</span></div>':''}<h4>${esc(d.title||'Untitled')}</h4><p>${esc(t?.name||d.templateId)}${d.metadata?.subject?' · '+esc(d.metadata.subject):''}</p><div class="meta"><span class="chip">${esc(fmtDate(d.updatedAt))}</span><span class="chip sync-chip ${esc(d.sync?.status||'local-only')}">${esc(d.sync?.status||'local-only')}</span></div><div class="card-actions"><button class="btn primary small open">Open</button>${hasConflict?'<button class="btn small resolve">Resolve conflict</button>':''}</div>`;card.querySelector('.open').onclick=()=>openDocument(d.id);card.querySelector('.resolve')?.addEventListener('click',()=>TeryaqPlatform.resolveConflicts(d.id));return card}
async function deleteDocumentToTrash(d){if(confirm(`Move “${d.title}” to Trash?`)){await snapshotDocument(d,'Before deletion');await TeryaqPlatform.queueDelete(d);state.selectedDocumentIds.delete(d.id);await refreshLibrary();await renderActiveView();toast('Moved to Trash')}}
async function deleteSelectedDocumentsToTrash(){const docs=state.docs.filter(d=>state.selectedDocumentIds.has(d.id));if(!docs.length)return;if(!confirm(`Move ${docs.length} selected document${docs.length===1?'':'s'} to Trash?`))return;const button=byId('bulkDeleteDocuments');button.disabled=true;button.textContent='Moving…';try{for(const d of docs){await snapshotDocument(d,'Before bulk deletion');await TeryaqPlatform.queueDelete(d)}state.selectedDocumentIds.clear();await refreshLibrary();await renderActiveView();toast(`${docs.length} document${docs.length===1?'':'s'} moved to Trash`)}finally{button.disabled=false;button.textContent='Move selected to Trash'}}
function renderTemplatesPage(){const host=byId('templatesPageGrid');host.innerHTML='';[...BUILTIN_TEMPLATES,...state.customTemplates].forEach(t=>{const item=document.createElement('article');item.className='template-choice-wrap';item.innerHTML=`<button class="template-choice" type="button"><span class="template-icon">${uiIcon(t.editor==='structured-form'?'figure':'text')}</span><span><strong>${esc(t.name)}</strong><small>${esc(t.description||'Reusable custom template')}</small><span class="template-meta">${esc(t.category||'Custom')} · v${esc(t.version||'1.0.0')}</span></span><span class="choice-check">→</span></button>${t.custom?'<button class="btn danger small delete-template">Delete custom template</button>':''}`;item.querySelector('.template-choice').onclick=()=>showNewDocumentWizard(t.id);item.querySelector('.delete-template')?.addEventListener('click',async()=>{if(confirm(`Delete custom template “${t.name}”?`)){await idbDelete('templates',t.id);await refreshLibrary();renderTemplatesPage()}});host.appendChild(item)})}
function templateInformationFields(t){
  const metadata=t.custom?t.baseDocument?.metadata:(t.id==='scientific-draft-figures'?{name:'',subject:'',chapterNumber:'',chapterTitle:'',generalNotes:''}:blankMeta());
  const definitions={name:['Name','text'],startDate:['Start date','date'],endDate:['End date','date'],subject:['Subject','text'],chapterNumber:['Chapter number','text'],chapterTitle:['Chapter title','text'],generalNotes:['General notes','textarea']};
  return Object.keys(metadata||{}).filter(key=>definitions[key]).map(key=>({key,label:definitions[key][0],type:definitions[key][1],required:['name','subject','chapterNumber','chapterTitle'].includes(key)}));
}
function showNewDocumentWizard(selectedId=''){
  const templates=[...BUILTIN_TEMPLATES,...state.customTemplates];let selected=selectedId&&templates.some(t=>t.id===selectedId)?selectedId:'';const body=byId('newDocumentBody');activateView('newDocument');
  const renderChoice=()=>{
    body.innerHTML=`<section class="wizard-page-card"><div class="wizard-head"><div><span class="eyebrow">New document</span><h3>Choose a template</h3><p>Select one template, then continue to its required information.</p></div><div class="wizard-steps"><span class="active">1 · Template</span><span>2 · Information</span></div></div><div class="template-picker"></div><div class="wizard-footer"><button class="btn" id="wizardCancel">← Documents</button><button class="btn primary" id="wizardNext" ${selected?'':'disabled'}>Next →</button></div></section>`;
    const picker=body.querySelector('.template-picker');
    templates.forEach(t=>{const item=document.createElement('article');item.className='template-choice-wrap';item.innerHTML=`<button class="template-choice${selected===t.id?' selected':''}" type="button" aria-pressed="${selected===t.id}"><span class="template-icon">${uiIcon(t.editor==='structured-form'?'figure':'text')}</span><span><strong>${esc(t.name)}</strong><small>${esc(t.description||'Reusable custom template')}</small><span class="template-meta">${esc(t.category||'Custom')} · v${esc(t.version||'1.0.0')}</span></span><span class="choice-check">✓</span></button>${t.custom?'<button class="btn danger small delete-template" type="button">Delete custom template</button>':''}`;
      item.querySelector('.template-choice').onclick=()=>{selected=t.id;renderChoice()};const del=item.querySelector('.delete-template');if(del)del.onclick=async()=>{if(confirm(`Delete custom template “${t.name}”?`)){await idbDelete('templates',t.id);await refreshLibrary();selected='';showNewDocumentWizard()}};picker.appendChild(item)});
    byId('wizardCancel').onclick=()=>activateView('documents');byId('wizardNext').onclick=()=>renderInformation(templates.find(t=>t.id===selected));
  };
  const renderInformation=t=>{const fields=templateInformationFields(t);body.innerHTML=`<section class="wizard-page-card"><div class="wizard-head"><div><span class="eyebrow">New document</span><h3>${esc(t.informationTitle||'Draft information')}</h3><p>Complete the basic information before opening the editor.</p></div><div class="wizard-steps"><span>1 · Template</span><span class="active">2 · Information</span></div></div><div class="selected-template-summary"><b>${esc(t.name)}</b><span>${esc(t.category||'Custom')}</span></div><form class="wizard-form" id="documentInfoForm">${fields.map(f=>`<div class="field${f.type==='textarea'?' span-2':''}"><label for="wizard-${esc(f.key)}">${esc(f.label)}${f.required?' *':''}</label>${f.type==='textarea'?`<textarea id="wizard-${esc(f.key)}" data-key="${esc(f.key)}" rows="4"></textarea>`:`<input id="wizard-${esc(f.key)}" data-key="${esc(f.key)}" type="${f.type}" ${f.key==='chapterNumber'?'inputmode="decimal" pattern="[0-9.]*" title="Numbers and dots only"':''} ${f.required?'required':''}>`}</div>`).join('')}<div class="wizard-footer span-2"><button class="btn" type="button" id="wizardBack">← Back</button><button class="btn primary" type="submit">Create & continue</button></div></form></section>`;const chapterInput=byId('wizard-chapterNumber');if(chapterInput)chapterInput.oninput=()=>{chapterInput.value=sanitizeChapterNumber(chapterInput.value)};byId('wizardBack').onclick=renderChoice;byId('documentInfoForm').onsubmit=async e=>{e.preventDefault();const metadata={};body.querySelectorAll('[data-key]').forEach(el=>metadata[el.dataset.key]=el.dataset.key==='chapterNumber'?sanitizeChapterNumber(el.value):el.value.trim());await createFromTemplate(t,metadata)}};
  renderChoice();
}
async function createFromTemplate(t,metadata={}){
  let doc;
  if(t.custom){doc=clone(t.baseDocument);doc.id=uid('doc');doc.createdAt=doc.updatedAt=nowIso();doc.title=t.name+' - New';}
  else doc=t.newDocument();
  doc.metadata={...(doc.metadata||{}),...metadata};doc.title=[doc.metadata.subject,doc.metadata.chapterNumber?`CH ${doc.metadata.chapterNumber}`:'',doc.metadata.chapterTitle,doc.templateId==='scientific-draft-figures'?'Figures':''].filter(Boolean).join(' — ')||(t.name+' - New');
  TeryaqPlatform.decorateNewDocument(doc);
  await idbPut('documents',doc);await TeryaqPlatform.queueDocument(doc);await refreshLibrary();openDocument(doc.id);
}
async function duplicateDocument(id){const d=await idbGet('documents',id);if(!d)return;const c=clone(d);c.id=uid('doc');c.title=(d.title||'Document')+' Copy';c.createdAt=c.updatedAt=nowIso();TeryaqPlatform.decorateNewDocument(c);await idbPut('documents',c);await TeryaqPlatform.queueDocument(c);await refreshLibrary();await renderActiveView();toast('Duplicated');}
async function openDocument(id){const d=await idbGet('documents',id);if(!d)return;state.current=d;state.dirty=false;state.editRevision=0;state.savedRevision=0;resetHistory();await activateView('editor');renderEditor();pushHistory('Open');}
async function ensureCurrentSaved(){
  if(!state.current)return true;
  if(state.dirty)return saveCurrent(true);
  if(state.saveInFlight)return state.saveChain;
  return true;
}
async function goHome(){if(!(await ensureCurrentSaved()))return;state.current=null;await refreshLibrary();renderHome();}

// ---------------- Current document save/history ----------------
function currentSnapshot(){return state.current?clone({metadata:state.current.metadata,content:state.current.content,title:state.current.title,settings:state.current.settings}):null}
function resetHistory(){state.history=[];state.historyIndex=-1;updateUndoRedo()}
function pushHistory(reason='Edit'){
  if(state.suppressHistory||!state.current)return;const snap=currentSnapshot();const serialized=JSON.stringify(snap);const current=state.history[state.historyIndex];if(current&&current.serialized===serialized)return;
  state.history=state.history.slice(0,state.historyIndex+1);state.history.push({serialized,snap,reason});if(state.history.length>MAX_HISTORY)state.history.shift();state.historyIndex=state.history.length-1;updateUndoRedo();
}
function scheduleTypingHistory(){clearTimeout(state.typingTimer);state.typingTimer=setTimeout(()=>pushHistory('Typing'),550)}
function undo(){if(state.historyIndex<=0)return;state.historyIndex--;restoreHistory(state.history[state.historyIndex].snap)}
function redo(){if(state.historyIndex>=state.history.length-1)return;state.historyIndex++;restoreHistory(state.history[state.historyIndex].snap)}
function restoreHistory(snap){state.suppressHistory=true;Object.assign(state.current,clone(snap));renderEditor(false);state.suppressHistory=false;markDirty(false);updateUndoRedo()}
function updateUndoRedo(){const canU=state.historyIndex>0,canR=state.historyIndex>=0&&state.historyIndex<state.history.length-1;$$('[data-action="undo"]').forEach(b=>b.disabled=!canU);$$('[data-action="redo"]').forEach(b=>b.disabled=!canR)}
function emergencyKey(ownerId,documentId){return `${EMERGENCY_DRAFT_PREFIX}${encodeURIComponent(ownerId)}:${encodeURIComponent(documentId)}`}
function persistEmergencyDraft(doc,revision=state.editRevision){
  const ownerId=TeryaqPlatform.user()?.id||doc?.ownerId;if(!doc?.id||!ownerId)return false;
  const payload={format:'TeryaqEmergencyDraft',savedAt:nowIso(),revision,ownerId,imagesOmitted:false,document:clone(doc)};
  try{localStorage.setItem(emergencyKey(ownerId,doc.id),JSON.stringify(payload));return true}catch(_){
    try{
      for(const figure of payload.document?.content?.figures||[])if(figure.image){figure.image='';payload.imagesOmitted=true}
      localStorage.setItem(emergencyKey(ownerId,doc.id),JSON.stringify(payload));return true
    }catch(error){console.warn('Emergency draft storage unavailable:',error);return false}
  }
}
function clearEmergencyDraft(documentId,maxRevision=Infinity){
  const ownerId=TeryaqPlatform.user()?.id;if(!ownerId||!documentId)return;
  const key=emergencyKey(ownerId,documentId);
  try{const payload=JSON.parse(localStorage.getItem(key)||'null');if(!payload||Number(payload.revision||0)<=maxRevision)localStorage.removeItem(key)}catch(error){console.warn('Emergency draft cleanup unavailable:',error)}
}
function mergeEmergencyImages(recovered,local){
  if(!local||!Array.isArray(recovered?.content?.figures))return recovered;
  const images=new Map((local.content?.figures||[]).map(figure=>[figure.id,figure.image]));
  for(const figure of recovered.content.figures)if(!figure.image&&images.get(figure.id))figure.image=images.get(figure.id);
  return recovered;
}
async function recoverEmergencyDrafts(){
  const ownerId=TeryaqPlatform.user()?.id;if(!ownerId)return 0;const prefix=`${EMERGENCY_DRAFT_PREFIX}${encodeURIComponent(ownerId)}:`;let recoveredCount=0;
  let keys=[];try{keys=Object.keys(localStorage).filter(key=>key.startsWith(prefix))}catch(error){console.warn('Emergency draft scan unavailable:',error);return 0}
  for(const key of keys){
    try{
      const payload=JSON.parse(localStorage.getItem(key)||'null'),draft=payload?.document;
      if(payload?.format!=='TeryaqEmergencyDraft'||payload.ownerId!==ownerId||!draft?.id){localStorage.removeItem(key);continue}
      const local=await idbGet('documents',draft.id);const draftTime=Date.parse(draft.updatedAt||payload.savedAt||0)||0,localTime=Date.parse(local?.updatedAt||0)||0;
      if(!local||draftTime>localTime){
        const restored=mergeEmergencyImages(clone(draft),local);restored.ownerId=ownerId;TeryaqPlatform.markDocumentPending(restored);await idbPut('documents',restored);await TeryaqPlatform.queueDocument(restored);recoveredCount++;
      }
      localStorage.removeItem(key);
    }catch(error){console.warn('Emergency draft recovery failed:',error)}
  }
  return recoveredCount;
}
function flushEmergencySave(){
  if(!state.current||!state.dirty)return;
  persistEmergencyDraft(state.current,state.editRevision);void saveCurrent(false);
}
function markDirty(history=true){
  if(!state.current)return;state.dirty=true;state.editRevision++;state.current.updatedAt=nowIso();persistEmergencyDraft(state.current,state.editRevision);setSaveStatus('Saving…');if(history)scheduleTypingHistory();clearTimeout(state.saveTimer);state.saveTimer=setTimeout(()=>saveCurrent(false),250)
}
async function saveCurrent(manual=false){
  if(!state.current)return true;
  clearTimeout(state.saveTimer);state.saveTimer=null;
  const documentId=state.current.id,revision=state.editRevision,snapshot=clone(state.current);snapshot.updatedAt=nowIso();snapshot.localSavedAt=snapshot.updatedAt;snapshot.localSaveToken=uid('save');TeryaqPlatform.markDocumentPending(snapshot);
  if(state.current?.id===documentId){state.current.updatedAt=snapshot.updatedAt;state.current.localSavedAt=snapshot.localSavedAt;state.current.localSaveToken=snapshot.localSaveToken;state.current.sync=clone(snapshot.sync)}
  persistEmergencyDraft(snapshot,revision);state.saveInFlight++;if(manual)state.blockingSaveInFlight++;updateEditorLocks();setSaveStatus('Saving…');
  const task=state.saveChain.then(async()=>{
    try{
      const persisted=await idbPutDocumentPreservingSync(snapshot);snapshot.sync=clone(persisted.sync||snapshot.sync||{});if(state.current?.id===documentId){state.current.sync={...(state.current.sync||{}),baseServerVersion:Math.max(Number(state.current.sync?.baseServerVersion||0),Number(snapshot.sync?.baseServerVersion||0))};if(snapshot.sync?.status==='conflict')state.current.sync={...state.current.sync,status:'conflict',lastError:snapshot.sync.lastError}}await TeryaqPlatform.queueDocument(snapshot);const verified=await idbGet('documents',documentId);if(verified?.localSaveToken!==snapshot.localSaveToken)throw new Error('IndexedDB read-back verification failed');
      if(state.current?.id===documentId&&state.editRevision<=revision){state.dirty=false;state.savedRevision=revision;clearEmergencyDraft(documentId,revision);setSaveStatus(navigator.onLine?'Saved locally ✓ · sync pending':'Saved locally ✓ · offline')}
      else if(state.current?.id===documentId)setSaveStatus('Newer changes waiting to save…');
      TeryaqPlatform.updateSyncUi();if(manual&&state.current?.id===documentId&&state.editRevision<=revision)toast('Saved locally ✓');return true
    }catch(error){
      console.error(error);if(state.current?.id===documentId){state.dirty=true;persistEmergencyDraft(state.current,state.editRevision);setSaveStatus('Save failed · emergency draft kept')}
      if(manual)alert(`Local save failed. Your emergency draft was kept on this device.\n\n${error.message}`);return false
    }
  });
  state.saveChain=task.catch(()=>false);
  try{return await task}finally{state.saveInFlight=Math.max(0,state.saveInFlight-1);if(manual)state.blockingSaveInFlight=Math.max(0,state.blockingSaveInFlight-1);updateEditorLocks()}
}
async function saveAndSyncCurrent(){
  if(!state.current)return;const documentId=state.current.id;
  if(!(await saveCurrent(true)))return;
  state.syncInFlight=true;updateEditorLocks();setSaveStatus('Sending to cloud…');
  try{
    let result=await TeryaqPlatform.syncNow(),activeDocumentId=state.current?.id||documentId,stored=await idbGet('documents',activeDocumentId);
    if(result?.ok&&stored?.sync?.status==='pending'&&navigator.onLine){result=await TeryaqPlatform.syncNow();activeDocumentId=state.current?.id||activeDocumentId;stored=await idbGet('documents',activeDocumentId)}
    activeDocumentId=state.current?.id||activeDocumentId;if(!stored||stored.id!==activeDocumentId)stored=await idbGet('documents',activeDocumentId);
    if(stored&&state.current?.id===activeDocumentId)state.current.sync=clone(stored.sync||{});
    if(result?.ok&&stored?.sync?.status==='synced'){
      const version=Number(stored.sync.baseServerVersion||0);setSaveStatus(version?`Saved locally ✓ · cloud version ${version} ✓`:'Saved locally ✓ · synced ✓');toast(version?`Synced · cloud version ${version}`:'Synced ✓')
    }else if(stored?.sync?.status==='conflict')setSaveStatus('Saved locally ✓ · sync conflict needs review');
    else setSaveStatus(navigator.onLine?'Saved locally ✓ · sync pending':'Saved locally ✓ · offline');
  }finally{state.syncInFlight=false;updateEditorLocks()}
}
async function snapshotDocument(doc,reason='Snapshot'){const s={id:uid('snap'),ownerId:TeryaqPlatform.user()?.id||doc.ownerId,documentId:doc.id,createdAt:nowIso(),reason,document:clone(doc)};await idbPut('snapshots',s);state.lastSnapshotAt=Date.now();return s}
async function createSnapshot(reason='Manual snapshot'){if(!state.current)return;await saveCurrent(false);await snapshotDocument(state.current,reason);toast('Recovery snapshot created')}

// ---------------- Render editor shell ----------------
function renderEditor(resetSelection=true){
  const d=state.current;if(!d)return;byId('docTitle').textContent=d.title||'Untitled';
  byId('textEditorArea').classList.toggle('hidden',d.templateId!=='scientific-draft-text');byId('figureEditorArea').classList.toggle('hidden',d.templateId!=='scientific-draft-figures');
  if(d.templateId==='scientific-draft-text')renderTextEditor(resetSelection);else renderFigureEditor();
  bindEditorActionButtons();updateUndoRedo();
}
function bindEditorActionButtons(){
  byId('saveBtn').onclick=()=>saveCurrent(true);byId('validateBtn').onclick=()=>showValidation();byId('backupBtn').onclick=()=>exportDocumentPackage(state.current);byId('printBtn').onclick=()=>printCurrent();byId('historyBtn').onclick=()=>showSnapshots();byId('saveTemplateBtn').onclick=()=>saveAsTemplate();
  byId('syncBtnEditor').onclick=()=>saveAndSyncCurrent();byId('settingsBtnEditor').onclick=()=>activateView('settings');updateEditorLocks();
}


// ---------------- Text editor render ----------------
function renderTextEditor(resetSelection=true){
  const d=state.current;renderMeta();renderBlocks();renderOutline();renderRegisters();observeWritingPage();requestAnimationFrame(()=>{syncEditorStickyOffsets();updatePageScale()});if(resetSelection){state.activeBlockId=d.content.blocks[0]?.id||null;state.selectionBookmark=null;}bindTextControls();
}
function renderMeta(){
  const m=state.current.metadata||blankMeta();
  for(const [id,key] of [['metaName','name'],['metaStart','startDate'],['metaEnd','endDate'],['metaSubject','subject'],['metaChapter','chapterNumber'],['metaTitle','chapterTitle'],['metaNotes','generalNotes']]){
    const el=byId(id);el.value=key==='chapterNumber'?sanitizeChapterNumber(m[key]||''):(m[key]||'');el.oninput=()=>{if(key==='chapterNumber')el.value=sanitizeChapterNumber(el.value);state.current.metadata[key]=el.value;if(key==='chapterTitle'||key==='subject'||key==='chapterNumber')updateDocumentTitle();markDirty();renderRegisters()};
  }
}
function updateDocumentTitle(){const m=state.current.metadata;state.current.title=[m.subject,m.chapterNumber?`CH ${m.chapterNumber}`:'',m.chapterTitle].filter(Boolean).join(' — ')||'Untitled Scientific Draft';byId('docTitle').textContent=state.current.title}
function renderBlocks(){
  const host=byId('blockList');host.innerHTML='';let h1=0,h2=0,numSeq=0;
  for(const block of state.current.content.blocks){
    if(block.type==='paragraph'&&block.style==='Heading1'){h1++;h2=0;numSeq=0;} else if(block.type==='paragraph'&&block.style==='Heading2'){h2++;numSeq=0;} else if(block.type!=='number')numSeq=0;
    if(block.type==='number')numSeq++;
    host.appendChild(renderBlock(block,{h1,h2,numSeq}));
  }
  if(!state.current.content.blocks.length){const b=normalBlock();state.current.content.blocks.push(b);host.appendChild(renderBlock(b,{h1:0,h2:0,numSeq:0}));}
}
function renderBlock(block,ctx){
  let el=document.createElement('div');el.className='doc-block';el.dataset.blockId=block.id;el.dataset.type=block.type;if(['paragraph','bullet','number'].includes(block.type))applyBlockDirection(el,plainText(block.runs||[]));
  if(block.type==='paragraph'){
    el.classList.add(`p-${block.style||'Normal'}`);if(block.style==='Heading1'||block.style==='Heading2'){
      const n=document.createElement('span');n.className='heading-num';n.textContent=(block.style==='Heading1'?ctx.h1:ctx.h2)+'.';el.appendChild(n);
      const ed=editableForBlock(block);ed.classList.add('heading-text');el.appendChild(ed);
    } else el.appendChild(editableForBlock(block));
  } else if(block.type==='bullet'){
    el.classList.add('bullet-block',`level-${block.level}`);const m=document.createElement('span');m.className='bullet-marker';m.textContent=STYLE_CONTRACT.BulletLevels[block.level]?.marker||'●';el.appendChild(m);el.appendChild(editableForBlock(block));
  } else if(block.type==='number'){
    el.classList.add('number-block');const m=document.createElement('span');m.className='bullet-marker';m.textContent=`${ctx.numSeq}.`;el.appendChild(m);el.appendChild(editableForBlock(block));
  } else if(block.type==='figure_placeholder'){
    el.classList.add('figure-placeholder');el.dataset.figureCode=block.code||'';el.dataset.placement=block.placement||'main';el.textContent=`[POSITION OF ${block.placement==='margin'?'MARGIN ':''}FIGURE ${block.code||'?'}]`;el.tabIndex=0;
  } else if(block.type==='table'){
    el.classList.add('table-block');el.appendChild(renderTable(block));
  }
  el.addEventListener('pointerdown',()=>setActiveBlock(block.id));el.addEventListener('focusin',()=>setActiveBlock(block.id));el.addEventListener('click',()=>setActiveBlock(block.id));
  return el;
}
function editableForBlock(block){
  const ed=document.createElement('div');ed.className='editable';ed.contentEditable='true';ed.spellcheck=true;applyBlockDirection(ed,plainText(block.runs||[]));ed.dataset.placeholder='Type here…';ed.innerHTML=runsToHtml(block.runs||[]);
  ed.addEventListener('input',()=>{block.runs=elementToRuns(ed);applyBlockDirection(ed.closest('.doc-block')||ed,plainText(block.runs));captureSelection();markDirty();if(block.style?.startsWith('Heading')){renderOutline();renderRegisters();}});
  ed.addEventListener('focus',()=>{setActiveBlock(block.id);captureSelection()});ed.addEventListener('keyup',captureSelection);ed.addEventListener('mouseup',captureSelection);ed.addEventListener('touchend',()=>setTimeout(captureSelection,0));
  ed.addEventListener('paste',e=>handlePaste(e,block,ed));ed.addEventListener('keydown',e=>handleBlockKeydown(e,block,ed));
  return ed;
}
function handlePaste(e,block,ed){
  e.preventDefault();const text=(e.clipboardData||window.clipboardData).getData('text/plain').replace(/\r\n?/g,'\n');insertPlainTextAtSelection(ed,text);block.runs=elementToRuns(ed);applyBlockDirection(ed.closest('.doc-block')||ed,plainText(block.runs));captureSelection();markDirty();
}
function insertPlainTextAtSelection(ed,text){
  const sel=window.getSelection();if(!sel.rangeCount||!ed.contains(sel.anchorNode)){ed.focus();const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);sel.removeAllRanges();sel.addRange(r);}const r=sel.getRangeAt(0);r.deleteContents();const parts=text.split('\n');const frag=document.createDocumentFragment();parts.forEach((p,i)=>{if(i)frag.appendChild(document.createElement('br'));frag.appendChild(document.createTextNode(p));});const last=frag.lastChild;r.insertNode(frag);if(last){r.setStartAfter(last);r.collapse(true);sel.removeAllRanges();sel.addRange(r)}}
function handleBlockKeydown(e,block,ed){
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();splitCurrentBlock(block,ed);return;}
  if(e.key==='Backspace'&&selectionOffset(ed)===0){if(plainText(block.runs).length===0){e.preventDefault();removeBlock(block.id,true);} }
}
function selectionOffset(ed){const sel=window.getSelection();if(!sel.rangeCount||!ed.contains(sel.anchorNode))return -1;const r=sel.getRangeAt(0);if(!r.collapsed)return -1;const pre=document.createRange();pre.selectNodeContents(ed);pre.setEnd(r.startContainer,r.startOffset);return pre.toString().length}
function splitCurrentBlock(block,ed){
  captureSelection();const bm=state.selectionBookmark;const off=bm?.blockId===block.id?bm.start:plainText(block.runs).length;block.runs=elementToRuns(ed);const [left,right]=splitRuns(block.runs,off);block.runs=left;
  let next;if(block.type==='bullet')next={id:uid('b'),type:'bullet',level:block.level,runs:right};else if(block.type==='number')next={id:uid('b'),type:'number',runs:right};else next={id:uid('b'),type:'paragraph',style:(block.style==='Heading1'||block.style==='Heading2')?'Normal':(block.style||'Normal'),runs:right};
  const arr=state.current.content.blocks,idx=arr.findIndex(b=>b.id===block.id);arr.splice(idx+1,0,next);markDirty(false);pushHistory('New paragraph');renderBlocks();renderOutline();renderRegisters();setTimeout(()=>focusBlock(next.id,0),0);
}
function removeBlock(id,focusPrev=false){const arr=state.current.content.blocks;const idx=arr.findIndex(b=>b.id===id);if(idx<0)return;const prev=arr[idx-1];arr.splice(idx,1);if(!arr.length)arr.push(normalBlock());markDirty(false);pushHistory('Delete block');renderBlocks();renderOutline();renderRegisters();if(focusPrev&&prev)setTimeout(()=>focusBlock(prev.id,plainText(prev.runs||[]).length),0)}
function setActiveBlock(id){state.activeBlockId=id;$$('.doc-block.active').forEach(x=>x.classList.remove('active'));const el=document.querySelector(`[data-block-id="${CSS.escape(id)}"]`);if(el)el.classList.add('active')}
function getBlock(id=state.activeBlockId){return state.current?.content?.blocks?.find(b=>b.id===id)}
function focusBlock(id,offset=0){const el=document.querySelector(`[data-block-id="${CSS.escape(id)}"] .editable`);if(!el)return;el.focus();setCaretByCharOffset(el,offset);setActiveBlock(id);captureSelection()}
function setCaretByCharOffset(root,offset){const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n,pos=0;while(n=walker.nextNode()){const end=pos+n.nodeValue.length;if(offset<=end){const r=document.createRange();r.setStart(n,Math.max(0,offset-pos));r.collapse(true);const s=window.getSelection();s.removeAllRanges();s.addRange(r);return}pos=end}const r=document.createRange();r.selectNodeContents(root);r.collapse(false);const s=window.getSelection();s.removeAllRanges();s.addRange(r)}

// Stable selection bookmark per active block
function captureSelection(){
  const sel=window.getSelection();if(!sel.rangeCount)return;const r=sel.getRangeAt(0);const ed=(r.startContainer.nodeType===1?r.startContainer:r.startContainer.parentElement)?.closest?.('.editable');if(!ed||!byId('blockList').contains(ed))return;const blockEl=ed.closest('.doc-block');if(!blockEl)return;const pre=document.createRange();pre.selectNodeContents(ed);pre.setEnd(r.startContainer,r.startOffset);const start=pre.toString().length;let end=start;try{const pre2=document.createRange();pre2.selectNodeContents(ed);pre2.setEnd(r.endContainer,r.endOffset);end=pre2.toString().length}catch{}state.selectionBookmark={blockId:blockEl.dataset.blockId,start,end};state.activeBlockId=blockEl.dataset.blockId;
}
function restoreSelection(){const bm=state.selectionBookmark;if(!bm)return false;const ed=document.querySelector(`[data-block-id="${CSS.escape(bm.blockId)}"] .editable`);if(!ed)return false;const points=[findPoint(ed,bm.start),findPoint(ed,bm.end)];if(!points[0]||!points[1])return false;const r=document.createRange();r.setStart(points[0].node,points[0].offset);r.setEnd(points[1].node,points[1].offset);const s=window.getSelection();s.removeAllRanges();s.addRange(r);return true}
function findPoint(root,target){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n,pos=0,last=null;while(n=w.nextNode()){last=n;const end=pos+n.nodeValue.length;if(target<=end)return{node:n,offset:Math.max(0,target-pos)};pos=end}if(last)return{node:last,offset:last.nodeValue.length};const t=document.createTextNode('');root.appendChild(t);return{node:t,offset:0}}

function bindToolbarSafe(el,fn){if(!el)return;el.onpointerdown=e=>{e.preventDefault();captureSelection();fn(e)}}
function bindTextControls(){
  $$('button[data-style]').forEach(b=>bindToolbarSafe(b,()=>applyParagraphStyle(b.dataset.style)));
  $$('button[data-mark]').forEach(b=>bindToolbarSafe(b,()=>applyMark(b.dataset.mark)));
  $$('button[data-action="bullet"]').forEach(b=>bindToolbarSafe(b,()=>convertToBullet(+b.dataset.level)));
  bindToolbarSafe(byId('numberBtn'),()=>convertToNumber());bindToolbarSafe(byId('mainFigBtn'),()=>insertFigurePlaceholder('main'));bindToolbarSafe(byId('marginFigBtn'),()=>insertFigurePlaceholder('margin'));bindToolbarSafe(byId('newTableBtn'),()=>insertTable());
  bindToolbarSafe(byId('boldBtn'),()=>applyMark('bold'));bindToolbarSafe(byId('italicBtn'),()=>applyMark('italic'));byId('fontSizeSelect').onpointerdown=()=>captureSelection();byId('fontSizeSelect').onchange=()=>{const v=byId('fontSizeSelect').value;if(v)applyMark(`font:${v}`);byId('fontSizeSelect').value=''};
  for(const [id,action] of [['rowUpBtn','rowAbove'],['rowDownBtn','rowBelow'],['colLeftBtn','colLeft'],['colRightBtn','colRight'],['delRowBtn','delRow'],['delColBtn','delCol'],['equalColsBtn','equalCols']])bindToolbarSafe(byId(id),()=>tableAction(action));
  bindToolbarSafe(byId('applyColWidthBtn'),()=>tableAction('setWidth',+byId('colWidthInput').value));
  $$('[data-action="undo"]').forEach(b=>bindToolbarSafe(b,undo));$$('[data-action="redo"]').forEach(b=>bindToolbarSafe(b,redo));
  byId('mobileControlsToggle').onclick=()=>{byId('leftPanel').classList.toggle('mobile-open');requestAnimationFrame(syncEditorStickyOffsets)};byId('mobileOutlineToggle').onclick=()=>byId('rightPanel').classList.toggle('mobile-open');byId('outlineDrawerToggle').onclick=()=>{const panel=byId('rightPanel'),open=!panel.classList.contains('drawer-open');panel.classList.toggle('drawer-open',open);byId('outlineDrawerToggle').setAttribute('aria-expanded',String(open))};
}
function applyParagraphStyle(style){
  const b=getBlock();if(!b)return toast('Click in a paragraph first');if(b.type==='figure_placeholder'||b.type==='table')return toast('Select a text block first');
  if(b.type!=='paragraph'){b.type='paragraph';delete b.level;}b.style=style;b.runs=(b.runs||[]).map(r=>({text:r.text,marks:(r.marks||[]).filter(m=>!['SideNote','NotesToDelete','HighYield','ClinicalCorrelation'].includes(m))}));
  markDirty(false);pushHistory(`Style ${style}`);renderBlocks();renderOutline();renderRegisters();setTimeout(()=>focusBlock(b.id,plainText(b.runs).length),0);
}
function applyMark(mark){
  const b=getBlock();if(!b||!['paragraph','bullet','number'].includes(b.type))return toast('Select text first');if(!state.selectionBookmark||state.selectionBookmark.blockId!==b.id||state.selectionBookmark.start===state.selectionBookmark.end)return toast('Select text first');
  const start=Math.min(state.selectionBookmark.start,state.selectionBookmark.end),end=Math.max(state.selectionBookmark.start,state.selectionBookmark.end);b.runs=applyMarkToRuns(b.runs,start,end,mark);markDirty(false);pushHistory(`Format ${mark}`);renderBlocks();setTimeout(()=>{state.selectionBookmark={blockId:b.id,start,end};restoreSelection()},0);
}
function applyMarkToRuns(runs,start,end,mark){
  const out=[];let pos=0;const isFont=mark.startsWith('font:');
  for(const r of runs||[]){const a=pos,b=pos+r.text.length;if(end<=a||start>=b){out.push(clone(r));pos=b;continue}const s=Math.max(start,a)-a,e=Math.min(end,b)-a;const before=r.text.slice(0,s),mid=r.text.slice(s,e),after=r.text.slice(e);if(before)out.push({text:before,marks:[...(r.marks||[])]});if(mid){let marks=[...(r.marks||[])];if(isFont)marks=marks.filter(x=>!x.startsWith('font:'));if(marks.includes(mark))marks=marks.filter(x=>x!==mark);else marks.push(mark);out.push({text:mid,marks});}if(after)out.push({text:after,marks:[...(r.marks||[])]});pos=b;}
  return normalizeRuns(out);
}
function convertToBullet(level){const b=getBlock();if(!b||b.type==='table'||b.type==='figure_placeholder')return;b.type='bullet';b.level=level;delete b.style;markDirty(false);pushHistory(`Bullet ${level}`);renderBlocks();renderOutline();renderRegisters();setTimeout(()=>focusBlock(b.id,plainText(b.runs||[]).length),0)}
function convertToNumber(){const b=getBlock();if(!b||b.type==='table'||b.type==='figure_placeholder')return;b.type='number';delete b.style;delete b.level;markDirty(false);pushHistory('Numbered item');renderBlocks();renderOutline();renderRegisters();setTimeout(()=>focusBlock(b.id,plainText(b.runs||[]).length),0)}
function insertFigurePlaceholder(placement){const code=prompt(`${placement==='margin'?'Margin f':'F'}igure code (e.g., 3.1):`,'');if(!code)return;const b={id:uid('b'),type:'figure_placeholder',placement,code:code.trim()};insertBlockAfterActive(b);}
function insertBlockAfterActive(block){const arr=state.current.content.blocks;let idx=arr.findIndex(x=>x.id===state.activeBlockId);if(idx<0)idx=arr.length-1;arr.splice(idx+1,0,block);markDirty(false);pushHistory('Insert block');renderBlocks();renderOutline();renderRegisters();setActiveBlock(block.id)}

// ---------------- Tables ----------------
function insertTable(){
  const rowInput=prompt('Rows:','3');if(rowInput===null)return;const colInput=prompt('Columns:','3');if(colInput===null)return;
  const rows=Math.max(2,Math.min(20,+rowInput||3)),cols=Math.max(2,Math.min(8,+colInput||3));const code=prompt('Table code:','');if(code===null)return;const title=prompt('Table title:','');if(title===null)return;const caption=prompt('Table caption (optional):','');if(caption===null)return;
  if(!code.trim()||!title.trim())return toast('Table code and Table title are required');
  const block={id:uid('tbl'),type:'table',code:code.trim(),title:title.trim(),caption:caption.trim(),widths:Array(cols).fill(100/cols),rows:Array.from({length:rows},()=>Array.from({length:cols},()=>({runs:[]})))};insertBlockAfterActive(block)
}
function tableCaptionText(block){const lead=['Table',String(block.code||'').trim()].filter(Boolean).join(' '),title=String(block.title||'').trim(),caption=String(block.caption||'').trim();return `${lead}${lead&&title?' — ':''}${title}${caption?`${lead||title?' · ':''}${caption}`:''}`.trim()}
function refreshRenderedTableCaption(block){const caption=document.querySelector(`[data-block-id="${CSS.escape(block.id)}"] .table-caption`);if(caption)caption.textContent=tableCaptionText(block)}
function renderTable(block){
  const wrap=document.createElement('div');const sc=document.createElement('div');sc.className='table-wrap';const table=document.createElement('table');table.className='doc-table';table.dataset.tableId=block.id;const body=document.createElement('tbody');
  block.rows.forEach((row,ri)=>{const tr=document.createElement('tr');row.forEach((cell,ci)=>{const td=document.createElement(ri===0?'th':'td');if(block.widths?.[ci])td.style.width=block.widths[ci]+'%';const ed=document.createElement('div');ed.className='table-cell-editor';ed.contentEditable='true';ed.setAttribute('dir','auto');ed.innerHTML=runsToHtml(cell.runs||[]);ed.addEventListener('focus',()=>selectTableCell(block.id,ri,ci,td));ed.addEventListener('click',()=>selectTableCell(block.id,ri,ci,td));ed.addEventListener('input',()=>{cell.runs=elementToRuns(ed);selectTableCell(block.id,ri,ci,td);markDirty()});ed.addEventListener('paste',e=>{e.preventDefault();insertPlainTextAtSelection(ed,(e.clipboardData||window.clipboardData).getData('text/plain'));cell.runs=elementToRuns(ed);markDirty()});td.appendChild(ed);tr.appendChild(td)});body.appendChild(tr)});table.appendChild(body);sc.appendChild(table);wrap.appendChild(sc);
  const cap=document.createElement('div');cap.className='table-caption';cap.textContent=tableCaptionText(block);wrap.appendChild(cap);return wrap;
}
function selectTableCell(tableId,row,col,td){state.activeTableId=tableId;state.activeCell={row,col};state.activeBlockId=tableId;$$('.selected-cell').forEach(x=>x.classList.remove('selected-cell'));td?.classList.add('selected-cell')}
function tableAction(action,value){const t=getBlock(state.activeTableId);if(!t||t.type!=='table'||!state.activeCell)return toast('Click inside a table cell first');let {row,col}=state.activeCell;const cols=t.rows[0]?.length||0;
  if(action==='rowAbove')t.rows.splice(row,0,Array.from({length:cols},()=>({runs:[]})));
  if(action==='rowBelow')t.rows.splice(row+1,0,Array.from({length:cols},()=>({runs:[]})));
  if(action==='delRow'){if(t.rows.length<=1)return toast('Table must keep at least one row');t.rows.splice(row,1);row=Math.max(0,row-1)}
  if(action==='colLeft'||action==='colRight'){const at=action==='colLeft'?col:col+1;t.rows.forEach(r=>r.splice(at,0,{runs:[]}));t.widths=Array(t.rows[0].length).fill(100/t.rows[0].length);col=at}
  if(action==='delCol'){if(cols<=1)return toast('Table must keep at least one column');t.rows.forEach(r=>r.splice(col,1));t.widths=Array(t.rows[0].length).fill(100/t.rows[0].length);col=Math.max(0,col-1)}
  if(action==='equalCols')t.widths=Array(cols).fill(100/cols);
  if(action==='setWidth'&&value>0&&value<100){const n=t.rows[0].length;const remain=100-value;const others=(n>1)?remain/(n-1):0;t.widths=Array.from({length:n},(_,i)=>i===col?value:others)}
  state.activeCell={row,col};markDirty(false);pushHistory(`Table ${action}`);renderBlocks();renderRegisters();
}

// ---------------- Outline/register ----------------
function headingStructure(){const out=[];let current=null;let h1n=0,h2n=0;for(const b of state.current.content.blocks){if(b.type==='paragraph'&&b.style==='Heading1'){h1n++;h2n=0;current={id:b.id,n:h1n,title:plainText(b.runs).trim(),h2:[]};out.push(current)}else if(b.type==='paragraph'&&b.style==='Heading2'&&current){h2n++;current.h2.push({id:b.id,n:h2n,title:plainText(b.runs).trim()})}}return out}
function renderOutline(){const host=byId('outlineList');if(!host)return;const hs=headingStructure();host.innerHTML='';if(!hs.length){host.innerHTML='<div class="outline-empty">No Heading 1 sections yet.</div>';return;}for(const h of hs){const d=document.createElement('details');d.className='outline-group';d.open=true;const s=document.createElement('summary');s.innerHTML=`<span>${h.n}</span><span>${esc(h.title||'(Untitled heading)')}</span>`;s.onclick=e=>{if(e.target.closest('summary'))setTimeout(()=>scrollToBlock(h.id),0)};d.appendChild(s);if(h.h2.length){const list=document.createElement('div');list.className='outline-h2s';h.h2.forEach(x=>{const b=document.createElement('button');b.className='outline-link';b.innerHTML=`<strong>${x.n}</strong>&nbsp;&nbsp;${esc(x.title||'(Untitled)')}`;b.onclick=()=>scrollToBlock(x.id);list.appendChild(b)});d.appendChild(list)}host.appendChild(d)}}
function scrollToBlock(id){const el=document.querySelector(`[data-block-id="${CSS.escape(id)}"]`);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
function renderRegisters(){
  const h=headingStructure(),hr=byId('headingRegister');if(hr){hr.innerHTML='<div class="heading-register-head">Headings 1</div>';const count=Math.max(12,h.length);for(let i=0;i<count;i++){const row=document.createElement('div');row.className='heading-register-row';row.innerHTML=`<span class="n">${i+1}</span><span>${esc(h[i]?.title||'')}</span>`;hr.appendChild(row)}}
  const tables=state.current.content.blocks.filter(b=>b.type==='table'),tr=byId('tableRegister');if(!tr)return;tr.innerHTML='<div class="table-register-header"><span>Table code</span><span>Table title</span><span>Table caption (optional)</span></div>';
  if(!tables.length){tr.insertAdjacentHTML('beforeend','<div class="table-register-empty">Insert a table to add its information here automatically.</div>');return}
  tables.forEach((table,index)=>{const row=document.createElement('div');row.className='table-register-row';row.dataset.tableId=table.id;row.innerHTML=`<div class="field"><label class="sr-only" for="table-code-${index}">Table code</label><input id="table-code-${index}" data-table-field="code" value="${esc(table.code||'')}" placeholder="e.g., CH03-T01"></div><div class="field"><label class="sr-only" for="table-title-${index}">Table title</label><input id="table-title-${index}" data-table-field="title" value="${esc(table.title||'')}" placeholder="Table title"></div><div class="field"><label class="sr-only" for="table-caption-${index}">Table caption</label><input id="table-caption-${index}" data-table-field="caption" value="${esc(table.caption||'')}" placeholder="Optional caption"></div>`;row.querySelectorAll('[data-table-field]').forEach(input=>input.addEventListener('input',()=>{table[input.dataset.tableField]=input.value;refreshRenderedTableCaption(table);markDirty()}));tr.appendChild(row)
  })
}

// ---------------- Validation ----------------
function validateCurrent(){const d=state.current,issues=[];const err=m=>issues.push({level:'error',message:m}),warn=m=>issues.push({level:'warn',message:m});if(!d)return issues;
  if(d.templateId==='scientific-draft-text'){
    const m=d.metadata||{};for(const [k,l] of [['name','Name'],['subject','Subject'],['chapterNumber','Chapter number'],['chapterTitle','Chapter title']])if(!String(m[k]||'').trim())warn(`${l} is empty.`);
    let seenH1=false;const figCodes=new Map(),tableCodes=new Map();
    for(const b of d.content.blocks){if(b.type==='paragraph'&&b.style==='Heading1'){seenH1=true;if(!plainText(b.runs).trim())err('An empty Heading 1 exists.')}if(b.type==='paragraph'&&b.style==='Heading2'&&!seenH1)err(`Heading 2 “${plainText(b.runs).trim()||'(empty)'}” appears before any Heading 1.`);if(b.type==='figure_placeholder'){if(!String(b.code||'').trim())err('A figure placeholder has no code.');else figCodes.set(b.code,(figCodes.get(b.code)||0)+1)}if(b.type==='table'&&b.code)tableCodes.set(b.code,(tableCodes.get(b.code)||0)+1);if(['paragraph','bullet','number'].includes(b.type)&&(b.runs||[]).some(r=>(r.marks||[]).includes('NotesToDelete')))warn('A “Note to Delete” remains in the document.');if(b.type==='table'){const lens=b.rows.map(r=>r.length);if(new Set(lens).size>1)err(`Table ${b.code||'(uncoded)'} has inconsistent row lengths.`)}}
    for(const [c,n] of figCodes)if(n>1)err(`Figure code ${c} is duplicated ${n} times.`);for(const [c,n] of tableCodes)if(n>1)err(`Table code ${c} is duplicated ${n} times.`);if(!seenH1)warn('No Heading 1 exists yet.');
  } else {
    const codes=new Map();for(const f of d.content.figures||[]){if(!f.code)warn('A figure has no code.');if(!f.title)warn(`Figure ${f.code||'?'} has no title.`);if(!f.source)warn(`Figure ${f.code||'?'} has no source.`);if(!f.order)warn(`Figure ${f.code||'?'} has no order.`);if(!f.copyright)warn(`Figure ${f.code||'?'} has no copyright status.`);if(f.code)codes.set(f.code,(codes.get(f.code)||0)+1)}for(const [c,n] of codes)if(n>1)err(`Figure code ${c} is duplicated ${n} times.`)
  }
  return issues;
}
function showValidation(){const issues=validateCurrent(),host=byId('issues');host.innerHTML='';if(!issues.length)host.innerHTML='<div class="issue">✓ No structural issues found.</div>';else issues.forEach(i=>{const d=document.createElement('div');d.className=`issue ${i.level}`;d.textContent=(i.level==='error'?'ERROR: ':'WARNING: ')+i.message;host.appendChild(d)});byId('validationPanel').classList.remove('hidden')}

// ---------------- Export/import/backups ----------------
function exportDocumentPackage(doc){const pkg={format:'TeryaqPackage',packageVersion:'1.0.0',exportedAt:nowIso(),appVersion:APP_VERSION,document:clone(doc)};downloadBlob(new Blob([JSON.stringify(pkg,null,2)],{type:'application/json'}),`${fileSafe(doc.title)}.teryaq`)}
function downloadBlob(blob,name){if(!blob.size)return alert('Export failed: file is empty.');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},30000)}
async function importPackage(file){try{const txt=await file.text();const pkg=JSON.parse(txt);let doc=pkg.document||pkg;if(!doc.templateId||!doc.content)throw new Error('Not a Teryaq document');await snapshotIfConflict(doc);const sourceOwner=doc.ownerId,currentOwner=TeryaqPlatform.user()?.id;if((sourceOwner&&sourceOwner!==currentOwner)||await idbGet('documents',doc.id)){doc=clone(doc);doc.id=uid('doc');doc.title=(doc.title||'Imported')+' Imported';}if(String(doc.schemaVersion||'1.0.0')>SCHEMA_VERSION)throw new Error('This document was created with a newer document schema. Update TERYAQ Master Tool before editing it.');doc=TeryaqPlatform.decorateImportedDocument(doc);doc.updatedAt=nowIso();await idbPut('documents',doc);await TeryaqPlatform.queueDocument(doc);await refreshLibrary();renderHome();toast('Imported successfully')}catch(e){alert('Import failed: '+e.message)}finally{byId('importFile').value=''}}
async function snapshotIfConflict(doc){const old=await idbGet('documents',doc.id);if(old)await snapshotDocument(old,'Before import conflict')}
async function saveAsTemplate(){const name=prompt('Template name:',(state.current.title||'Document')+' Template');if(!name)return;const informationTitle=prompt('Information step title:','Draft information')||'Draft information';const base=clone(state.current);base.id='TEMPLATE_BASE';base.createdAt=base.updatedAt='';if(base.metadata){for(const k of Object.keys(base.metadata))base.metadata[k]=''}const t={id:uid('tpl'),ownerId:TeryaqPlatform.user()?.id,custom:true,name,version:'1.0.0',category:'Custom',informationTitle,description:'Custom reusable template saved locally.',editor:getTemplate(state.current.templateId)?.editor||'rich-document',baseDocument:base,createdAt:nowIso()};await idbPut('templates',t);await refreshLibrary();toast('Saved as reusable template')}

// ---------------- Version history ----------------
async function showSnapshots(){if(!state.current)return;const snaps=(await idbByIndex('snapshots','documentId',state.current.id)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,50);const body=byId('modalBody');body.innerHTML='<h3>History / Recovery Versions</h3><div class="history-explainer"><b>What is this?</b><br>These are local recovery snapshots for this document. Restore one if you need an earlier state. Separate immutable cloud versions are created after successful syncs and can be downloaded by an administrator.</div><div class="modal-actions"><button class="btn primary" id="createSnapshotNow">Create snapshot now</button></div>';if(!snaps.length)body.innerHTML+='<p>No recovery snapshots yet. Create one now, or keep editing and the app will create recovery points automatically.</p>';snaps.forEach(s=>{const r=document.createElement('div');r.className='snapshot-row';r.innerHTML=`<div><strong>${esc(fmtDate(s.createdAt))}</strong><br><small>${esc(s.reason||'Snapshot')}</small></div><button class="btn small">Restore</button>`;r.querySelector('button').onclick=async()=>{if(confirm('Restore this snapshot? Current state will first be saved as a snapshot.')){await createSnapshot('Before restore');state.current=clone(s.document);await saveCurrent(false);resetHistory();renderEditor();pushHistory('Restored');byId('modal').classList.add('hidden');toast('Snapshot restored')}};body.appendChild(r)});byId('createSnapshotNow').onclick=async()=>{await createSnapshot('Manual snapshot');showSnapshots()};byId('modal').classList.remove('hidden')}

// ---------------- Print renderer ----------------
function printCurrent(){const issues=validateCurrent();if(issues.some(i=>i.level==='error')&&!confirm('Validation has errors. Print anyway?'))return;const html=state.current.templateId==='scientific-draft-text'?buildTextPrintHtml(state.current):buildFigurePrintHtml(state.current);const w=window.open('','_blank');if(!w)return alert('Please allow popups for printing.');w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{w.focus();w.print()},450)}
function basePrintCss(){return `@page{size:A4;margin:21mm 16mm 18mm}*{box-sizing:border-box}body{margin:0;font-family:Tajawal,Arial,sans-serif;color:#000;font-size:11pt;line-height:1.30}.cover{page-break-after:always}.meta{width:100%;border-collapse:collapse}.meta td{border:1px solid #000;padding:6px}.meta td:first-child{width:28%;font-weight:bold}.reg{width:100%;border-collapse:collapse;margin-top:14px}.reg td,.reg th{border:1px solid #000;padding:5px}.h1{font-size:14pt;font-weight:bold;color:#C45911;margin:12pt 0 0}.h2{font-size:13pt;font-weight:bold;color:#538135;margin:2pt 0 0}.h3{font-size:12pt;font-weight:bold;color:#2E74B5;margin:2pt 0 0}.h4{font-size:11pt;font-style:italic;color:#2F5496}.subtitle{color:#7F7F7F}.caption{font-size:9pt;font-style:italic;color:#767171}.fig{background:#FFED29;color:#176A98;text-align:center;font-weight:bold;padding:7px 10px;margin:8pt 0 10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-inside:avoid}.bullet{display:grid;grid-template-columns:18px minmax(0,1fr);gap:5px;text-align:start}.l1{margin-inline-start:26pt}.l2{margin-inline-start:44pt}.l3{margin-inline-start:62pt}.num{display:grid;grid-template-columns:25px minmax(0,1fr);gap:5px;margin-inline-start:20pt;text-align:start}table.data{width:100%;border-collapse:collapse;table-layout:fixed;margin:3pt 0}table.data td,table.data th{border:1px solid #000;padding:5pt 6pt;vertical-align:top;overflow-wrap:anywhere}table.data thead{display:table-header-group}table.data tr{break-inside:avoid}.SideNote{color:#BF8F00}.NotesToDelete{color:#FF0000;font-weight:bold;font-size:9pt}.HighYield{color:#7030A0;font-weight:bold;text-decoration:underline}.ClinicalCorrelation{color:#39E794}h1,h2,h3,h4{break-after:avoid}`}
function runsPrintHtml(runs){return normalizeRuns(runs).map(r=>{let h=esc(r.text).replace(/\n/g,'<br>');const m=r.marks||[];if(m.includes('bold'))h=`<strong>${h}</strong>`;if(m.includes('italic'))h=`<em>${h}</em>`;for(const x of ['SideNote','NotesToDelete','HighYield','ClinicalCorrelation'])if(m.includes(x))h=`<span class="${x}">${h}</span>`;const fs=m.find(x=>x.startsWith('font:'));if(fs)h=`<span style="font-size:${esc(fs.split(':')[1])}pt">${h}</span>`;return h}).join('')}
function buildTextPrintHtml(d){let h1=0,h2=0,num=0;const headings=[],tables=[];let body='';for(const b of d.content.blocks){const direction=textDirection(plainText(b.runs||[]));if(b.type==='paragraph'){let cls='';let prefix='';if(b.style==='Heading1'){h1++;h2=0;cls='h1';prefix=h1+'. ';headings.push({n:h1,title:plainText(b.runs)})}else if(b.style==='Heading2'){h2++;cls='h2';prefix=h2+'. '}else if(b.style==='Heading3')cls='h3';else if(b.style==='Heading4')cls='h4';else if(b.style==='Subtitle')cls='subtitle';else if(b.style==='TableCaption')cls='caption';body+=`<div class="${cls}" dir="${direction}">${prefix}${runsPrintHtml(b.runs)}</div>`;num=0}else if(b.type==='bullet'){body+=`<div class="bullet l${b.level}" dir="${direction}"><span>${STYLE_CONTRACT.BulletLevels[b.level].marker}</span><div>${runsPrintHtml(b.runs)}</div></div>`;num=0}else if(b.type==='number'){num++;body+=`<div class="num" dir="${direction}"><span>${num}.</span><div>${runsPrintHtml(b.runs)}</div></div>`}else if(b.type==='figure_placeholder'){body+=`<div class="fig">[POSITION OF ${b.placement==='margin'?'MARGIN ':''}FIGURE ${esc(b.code)}]</div>`;num=0}else if(b.type==='table'){tables.push(b);body+=tablePrintHtml(b);num=0}}
  const m=d.metadata||{};const metaRows=[['Name',m.name],['Start date',m.startDate],['End date',m.endDate],['Subject',m.subject],['Chapter number',m.chapterNumber],['Chapter title',m.chapterTitle]].map(x=>`<tr><td>${esc(x[0])}</td><td>${esc(x[1]||'')}</td></tr>`).join('');const reg=Array.from({length:Math.max(12,headings.length)},(_,i)=>`<tr><td style="width:9%"><b>${i+1}</b></td><td>${esc(headings[i]?.title||'')}</td></tr>`).join('');const treg=`<tr><th>Table code</th><th>Table title</th><th>Table caption</th></tr>${tables.map(t=>`<tr><td><b>${esc(t.code||'')}</b></td><td>${esc(t.title||'')}</td><td>${esc(t.caption||'')}</td></tr>`).join('')}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${basePrintCss()}</style></head><body><section class="cover"><table class="meta">${metaRows}</table><table class="reg"><tr><th colspan="2" style="text-align:left">Headings 1</th></tr>${reg}</table><table class="reg">${treg}</table></section><main>${body}</main></body></html>`}
function tablePrintHtml(b){const rows=b.rows.map((r,ri)=>`<tr>${r.map((c,ci)=>`<${ri===0?'th':'td'} style="width:${b.widths?.[ci]||''}%">${runsPrintHtml(c.runs)}</${ri===0?'th':'td'}>`).join('')}</tr>`).join(''),caption=tableCaptionText(b);return `<table class="data"><tbody>${rows}</tbody></table>${caption?`<div class="caption">${esc(caption)}</div>`:''}`}
function buildFigurePrintHtml(d){const m=d.metadata||{};const cards=(d.content.figures||[]).map(f=>`<section style="break-after:page;margin-bottom:15mm"><table class="meta"><tr><td>Figure code</td><td>${esc(f.code)}</td></tr><tr><td>Figure title</td><td>${esc(f.title)}</td></tr><tr><td>Caption</td><td>${esc(f.caption)}</td></tr><tr><td>Source</td><td>${esc(f.source)}</td></tr><tr><td>Order</td><td>${esc(f.order)}</td></tr><tr><td>Details</td><td>${esc(f.details)}</td></tr><tr><td>Copyright status</td><td>${esc(f.copyright)}</td></tr><tr><td>Notes</td><td>${esc(f.notes)}</td></tr></table>${f.image?`<div style="text-align:center;margin-top:10mm"><img src="${f.image}" style="max-width:100%;max-height:120mm"></div>`:''}</section>`).join('');return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${basePrintCss()} img{object-fit:contain}</style></head><body><section class="cover"><table class="meta"><tr><td>Name</td><td>${esc(m.name)}</td></tr><tr><td>Subject</td><td>${esc(m.subject)}</td></tr><tr><td>Chapter number</td><td>${esc(m.chapterNumber)}</td></tr><tr><td>Chapter title</td><td>${esc(m.chapterTitle)}</td></tr><tr><td>General notes</td><td>${esc(m.generalNotes)}</td></tr></table></section>${cards}</body></html>`}

// ---------------- Figure editor ----------------
const FIG_ORDERS=['Order 1 - KEEP as it is','Order 2 - DO the following changes','Order 3 - RECREATE with Ai','Order 4 - DESIGN by Teryaq','Order 5 - SEARCH for a Figure'];
function renderFigureEditor(){const d=state.current,m=d.metadata;byId('addFigureBtn').onclick=()=>{d.content.figures.push(blankFigure());markDirty(false);pushHistory('Add figure');renderFigureCards();renderFigureNav();setTimeout(()=>byId(`fig-card-${d.content.figures.length}`)?.scrollIntoView({behavior:'smooth',block:'start'}),0)};for(const [id,key] of [['figMetaName','name'],['figMetaSubject','subject'],['figMetaChapter','chapterNumber'],['figMetaTitle','chapterTitle'],['figMetaNotes','generalNotes']]){const el=byId(id);el.value=key==='chapterNumber'?sanitizeChapterNumber(m[key]||''):(m[key]||'');el.oninput=()=>{if(key==='chapterNumber')el.value=sanitizeChapterNumber(el.value);m[key]=el.value;if(key!=='generalNotes')d.title=[m.subject,m.chapterNumber?`CH ${m.chapterNumber}`:'',m.chapterTitle,'Figures'].filter(Boolean).join(' — ')||'Untitled Figures Draft';byId('docTitle').textContent=d.title;markDirty()}}renderFigureCards();renderFigureNav();}
function renderFigureCards(){const host=byId('figureCards');host.innerHTML='';state.current.content.figures.forEach((f,i)=>host.appendChild(renderFigureCard(f,i)))}
function renderFigureCard(f,i){const sec=document.createElement('section');sec.className='figure-card';sec.id=`fig-card-${i+1}`;sec.innerHTML=`<div class="figure-card-head"><div><strong>Figure ${i+1}</strong> <span class="chip">${esc(f.code||'No code')}</span></div><div class="card-actions"><button class="btn small duplicate">Duplicate</button><button class="btn danger small delete">Delete</button></div></div><div class="figure-card-body"><div class="figure-grid">
<div class="field"><label>Figure code *</label><input data-k="code" value="${esc(f.code)}" placeholder="e.g., 3.1"></div><div class="field"><label>Figure title *</label><input data-k="title" value="${esc(f.title)}"></div><div class="field span-2"><label>Caption</label><textarea data-k="caption">${esc(f.caption)}</textarea></div><div class="field span-2"><label>Source *</label><input data-k="source" value="${esc(f.source)}" placeholder="URL, book + page, or Teryaq"></div><div class="field"><label>Order *</label><select data-k="order"><option value="">Select order…</option>${FIG_ORDERS.map(o=>`<option ${o===f.order?'selected':''}>${esc(o)}</option>`).join('')}</select></div><div class="field"><label>Copyright status *</label><select data-k="copyright"><option value="">Select status…</option>${['There is copyright issues','There is no copyright issues',"I don't know"].map(o=>`<option ${o===f.copyright?'selected':''}>${esc(o)}</option>`).join('')}</select></div><div class="field span-2"><label>PROMPT — Details</label><textarea data-k="details">${esc(f.details)}</textarea></div><div class="field span-2"><label>Notes</label><textarea data-k="notes">${esc(f.notes)}</textarea></div><div class="field span-2"><label>Figure / reference image</label><div class="dropzone"><div class="drop-content">${f.image?`<img src="${f.image}">`:'Click or drop image here'}</div><input type="file" accept="image/*" hidden></div><div class="card-actions"><button class="btn small clear-image">Clear image</button></div></div></div></div>`;
  sec.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('input',()=>{f[el.dataset.k]=el.value;markDirty();renderFigureNav()}));sec.querySelector('.duplicate').onclick=()=>{const c=clone(f);c.id=uid('fig');state.current.content.figures.splice(i+1,0,c);markDirty(false);pushHistory('Duplicate figure');renderFigureCards();renderFigureNav()};sec.querySelector('.delete').onclick=()=>{if(confirm('Delete this figure?')){state.current.content.figures.splice(i,1);if(!state.current.content.figures.length)state.current.content.figures.push(blankFigure());markDirty(false);pushHistory('Delete figure');renderFigureCards();renderFigureNav()}};
  const dz=sec.querySelector('.dropzone'),inp=dz.querySelector('input');dz.onclick=e=>{if(e.target.closest('.clear-image'))return;inp.click()};dz.ondragover=e=>e.preventDefault();dz.ondrop=e=>{e.preventDefault();if(e.dataTransfer.files[0])loadFigImage(e.dataTransfer.files[0],f)};inp.onchange=()=>inp.files[0]&&loadFigImage(inp.files[0],f);sec.querySelector('.clear-image').onclick=()=>{f.image='';markDirty();renderFigureCards()};return sec;
}
function loadFigImage(file,f){if(!file.type.startsWith('image/'))return;const r=new FileReader();r.onload=()=>{f.image=r.result;markDirty(false);pushHistory('Add figure image');renderFigureCards()};r.readAsDataURL(file)}
function renderFigureNav(){const host=byId('figureNavButtons');host.innerHTML='';state.current.content.figures.forEach((f,i)=>{const b=document.createElement('button');b.textContent=i+1;b.title=f.title||`Figure ${i+1}`;b.onclick=()=>byId(`fig-card-${i+1}`).scrollIntoView({behavior:'smooth',block:'start'});host.appendChild(b)})}

// ---------------- Responsive page scale ----------------
function observeWritingPage(){const page=byId('writingPage');if(!page||typeof ResizeObserver==='undefined')return;if(!state.pageResizeObserver)state.pageResizeObserver=new ResizeObserver(()=>requestAnimationFrame(updatePageScale));state.pageResizeObserver.disconnect();state.pageResizeObserver.observe(page)}
function updatePageScale(){
  const main=document.querySelector('#textEditorArea .editor-main'),column=byId('editorContentColumn'),scaleHost=document.querySelector('#textEditorArea .page-scale-host'),wrap=byId('pageWrap'),page=byId('writingPage');if(!main||!column||!scaleHost||!wrap||!page)return;
  if(innerWidth<=820){page.style.removeProperty('--page-scale');column.style.width='100%';scaleHost.style.width='100%';scaleHost.style.height='auto';wrap.style.width='100%';wrap.style.height='auto';return}
  const rawWidth=page.offsetWidth||794,rawHeight=Math.max(page.scrollHeight,page.offsetHeight),available=Math.max(320,main.clientWidth-28),scale=Math.max(.7,Math.min(1.45,(available-2)/rawWidth)),displayWidth=Math.round(rawWidth*scale),displayHeight=Math.ceil(rawHeight*scale);
  page.style.setProperty('--page-scale',scale.toFixed(3));column.style.width=`${displayWidth}px`;scaleHost.style.width=`${displayWidth}px`;scaleHost.style.height=`${displayHeight}px`;wrap.style.width=`${displayWidth}px`;wrap.style.height=`${displayHeight}px`;
}

// ---------------- Mobile fixed controls behavior ----------------
function wireMobile(){/* CSS-driven; buttons bound in bindTextControls */}

// ---------------- Init ----------------
document.addEventListener('DOMContentLoaded',()=>boot().catch(e=>{console.error(e);alert('TERYAQ Master Tool failed to start: '+e.message)}));

})();
