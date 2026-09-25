/* TERYAQ Master Tool Offline App
   Local-first, dependency-free PWA prototype.
   Document data is structured JSON; the DOM is only the editor surface. */
(() => {
'use strict';

const APP_VERSION = '2.5.5';
const SCHEMA_VERSION = '2.0.0';
const DB_NAME = 'TeryaqAuthorDB';
const DB_VERSION = 4;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_HISTORY = 120;
const EMERGENCY_DRAFT_PREFIX = 'teryaq:emergency-draft:';
const SIDEBAR_COLLAPSED_KEY = 'teryaq:sidebar-collapsed';

const STYLE_CONTRACT = {
  Normal:{label:'Body',size:11,bold:false,italic:false,color:'#000000'},
  Heading1:{label:'H1',size:14,bold:true,italic:false,color:'#C45911'},
  Heading2:{label:'H2',size:13,bold:true,italic:false,color:'#538135'},
  Heading3:{label:'H3',size:12,bold:true,italic:false,color:'#2E74B5'},
  Heading4:{label:'H4',size:11,bold:false,italic:true,color:'#2F5496'},
  Subtitle:{label:'Side Q/A',size:11,bold:false,italic:false,color:'#7F7F7F'},
  TableCaption:{label:'Table Caption',size:9,bold:false,italic:true,color:'#767171'},
  SideNote:{label:'Side Note',size:11,bold:false,italic:false,color:'#BF8F00'},
  NotesToDelete:{label:'Note to Delete',size:9,bold:true,italic:false,color:'#FF0000'},
  HighYield:{label:'High-Yield',size:11,bold:true,italic:false,underline:true,color:'#7030A0'},
  ClinicalCorrelation:{label:'Clinical Correlation',size:11,bold:false,italic:false,color:'#39E794'},
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
  pageResizeObserver:null, selectedDocumentIds:new Set(), docxImportSession:null,
  ribbonTab:'styles', viewOnly:false, viewZoom:1, pageView:'one', documentActionMenu:null,
  contentOptions:{subjects:[],authors:[],chapters:[],loadedAt:null}
};

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const byId = id => document.getElementById(id);
const clone = obj => JSON.parse(JSON.stringify(obj));
const nowIso = () => new Date().toISOString();
const uid = (prefix='id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const UI_ICON_PATHS={
  home:'<path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.5v10.5h13V9.5M9.5 20v-6h5v6"/>',documents:'<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h5M10 12h6M10 16h6"/><path d="M4 7v12h3"/>',templates:'<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M3 9h18M9 9v12"/>',trash:'<path d="M4 7h16M9 3h6l1 4M18 7l-1 14H7L6 7M10 11v6M14 11v6"/>',guide:'<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .65-1.5 1.15-1.5 2.3M12 17h.01"/>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  text:'<path d="M6 3.5h9l3 3V20.5H6z"/><path d="M15 3.5v4h4M9 11h6M9 15h4"/><path d="m14.5 18.5 4-4 1.5 1.5-4 4H14z"/>',sync:'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M18.5 10A7 7 0 0 0 6.7 6.7L4 9M5.5 14A7 7 0 0 0 17.3 17.3L20 15"/>',refresh:'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M18.5 10A7 7 0 0 0 6.7 6.7L4 9M5.5 14A7 7 0 0 0 17.3 17.3L20 15"/>',conflict:'<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/><path d="M12 8v5M12 16h.01"/>',local:'<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 22h8M12 18v4"/>',figure:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>','panel-close':'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>','arrow-left':'<path d="m13.5 6-6 6 6 6M8 12h10"/>','arrow-right':'<path d="m10.5 6 6 6-6 6M16 12H6"/>','arrow-up':'<path d="m6 10 6-6 6 6M12 4v16"/>','arrow-down':'<path d="m6 14 6 6 6-6M12 20V4"/>','more-horizontal':'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  upload:'<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 15v5h16v-5"/>',download:'<path d="M12 4v12m0 0 4-4m-4 4-4-4"/><path d="M4 19v2h16v-2"/>',import:'<path d="M12 4v12m0 0 4-4m-4 4-4-4"/><path d="M4 19v2h16v-2"/>',export:'<path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 15v5h16v-5"/>',save:'<path d="M4 3h14l2 2v16H4z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',settings:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1A7 7 0 0 0 15 6l-.4-2.7h-4L10 6a7 7 0 0 0-1.5 1L6 6 4 9.4 6.1 11a7 7 0 0 0 0 2L4 14.6 6 18l2.5-1a7 7 0 0 0 1.5-1l2.5 1 2-3.4-2.1-1.6c.1-.3.1-.7.1-1Z"/>',
  'check-circle':'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>','chevron-down':'<path d="m6 9 6 6 6-6"/>',undo:'<path d="M9 7 4 12l5 5"/><path d="M4 12h9a7 7 0 0 1 7 7"/>',redo:'<path d="m15 7 5 5-5 5"/><path d="M20 12h-9a7 7 0 0 0-7 7"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/>','log-out':'<path d="M10 17l5-5-5-5M15 12H3"/><path d="M14 3h7v18h-7"/>',chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',cloud:'<path d="M7 19h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.25 9.7 4.6 4.6 0 0 0 7 19Z"/>',activity:'<path d="M3 12h4l2-7 4 14 2-7h6"/>',megaphone:'<path d="m3 11 16-6v14L3 13zM3 11v2M7 14l1 6h4l-2-7"/>'
};
const UI_CUSTOM_ICON_FILES={
  settings:'settings.png','arrow-left':'back.png',home:'dashboard.png',templates:'templates.png',trash:'trash.png',shield:'admin.png',
  documents:'document.png',date:'date.png',save:'save.png',conflict:'conflict.png',chart:'analytics.png',users:'users-access.png',
  activity:'audit-log.png',content:'content-setup.png',overview:'overview.png',cloud:'cloud-operations.png',text:'draft-text.png',
  figure:'draft-figure.png',import:'import.png',export:'export.png',bell:'notifications.png',
  'bullet-1':'bullet-circle.png','bullet-2':'bullet-square.png','bullet-3':'bullet-rhomboid.png',
  success:'success.svg',sync:'sync-cloud.png',refresh:'sync-cloud.png',megaphone:'updates.svg',guide:'guide.svg'
};
function uiIcon(name){const file=UI_CUSTOM_ICON_FILES[name];if(file)return `<span class="ui-icon ui-custom-icon${name==='arrow-left'?' ui-back-icon':''}" style="--ui-icon:url('icons/ui/${file}')" aria-hidden="true"></span>`;return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${UI_ICON_PATHS[name]||UI_ICON_PATHS.documents}</svg>`}
window.TeryaqUIIcon=uiIcon;
function hydrateStaticIcons(root=document){root.querySelectorAll('[data-ui-icon]').forEach(host=>{host.innerHTML=uiIcon(host.dataset.uiIcon)})}

function toast(msg){ const el=byId('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),1800); }
function statusMarkup(text){return String(text??'').split('✓').map(esc).join(uiIcon('success'))}
function setSaveStatus(text){ const el=byId('saveStatus'); if(el) el.innerHTML=statusMarkup(text); }
function updateEditorLocks(){
  const saving=state.saveInFlight>0,busy=state.blockingSaveInFlight>0||state.syncInFlight;
  for(const id of ['saveBtn','syncBtnEditor','backBtn','settingsBtnEditor','editorImportBtn','validateBtn','historyBtn','exportMenuButton','backupBtn','saveTemplateBtn','printBtn','htmlExportBtn']){const button=byId(id);if(button)button.disabled=busy}
  if(busy)closeExportMenu();
  const save=byId('saveBtn');if(save)save.innerHTML=`${uiIcon('save')}<span>${saving?'Saving…':state.syncInFlight?'Sending…':'Save'}</span>`;
}
function fmtDate(iso){ if(!iso)return ''; try{return new Date(iso).toLocaleString();}catch{return iso;} }
function fileSafe(s){ return String(s||'Teryaq_Document').trim().replace(/[^\w\-]+/g,'_').replace(/_+/g,'_').slice(0,80) || 'Teryaq_Document'; }
function sanitizeChapterNumber(value){
  const arabic='٠١٢٣٤٥٦٧٨٩',persian='۰۱۲۳۴۵۶۷۸۹';
  return String(value??'').replace(/[٠-٩]/g,c=>String(arabic.indexOf(c))).replace(/[۰-۹]/g,c=>String(persian.indexOf(c))).replace(/[^0-9.]/g,'');
}
const sanitizeNumericCode=sanitizeChapterNumber;

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
      if(!db.objectStoreNames.contains('mediaQueue')){s=db.createObjectStore('mediaQueue',{keyPath:'id'});s.createIndex('ownerId','ownerId');s.createIndex('documentId','documentId');s.createIndex('status','status');}
      if(!db.objectStoreNames.contains('appCache'))db.createObjectStore('appCache',{keyPath:'key'});
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
function blankMeta(){ return {name:'',authorIds:[],startDate:'',endDate:'',course:'',courseId:'',subject:'',subjectId:'',chapterNumber:'',chapterTitle:'',chapterId:'',generalNotes:''}; }
function normalBlock(text=''){ return {id:uid('b'),type:'paragraph',style:'Normal',runs:text?[{text,marks:[]}]:[]}; }
function createTextDocument(){
  const t=BUILTIN_TEMPLATES[0];
  return {id:uid('doc'),format:'TeryaqDocument',schemaVersion:SCHEMA_VERSION,appVersion:APP_VERSION,templateId:t.id,templateVersion:t.version,title:'Untitled Scientific Draft',createdAt:nowIso(),updatedAt:nowIso(),metadata:blankMeta(),content:{blocks:[normalBlock()]},settings:{}};
}
function createFigureDocument(){
  const t=BUILTIN_TEMPLATES[1];
  return {id:uid('doc'),format:'TeryaqDocument',schemaVersion:SCHEMA_VERSION,appVersion:APP_VERSION,templateId:t.id,templateVersion:t.version,title:'Untitled Figures Draft',createdAt:nowIso(),updatedAt:nowIso(),metadata:{name:'',authorIds:[],course:'',courseId:'',subject:'',subjectId:'',chapterNumber:'',chapterTitle:'',chapterId:'',generalNotes:''},content:{figures:[blankFigure()]},settings:{}};
}
function blankFigure(){return {id:uid('fig'),code:'',title:'',caption:'',source:'',order:'',details:'',copyright:'',notes:'',image:'',attachmentId:'',storagePath:'',imageStatus:'',imageName:'',imageSize:0,uploadedBytes:0,uploadSpeed:0,uploadEta:0}}
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
  hydrateStaticIcons();
  TeryaqPlatform.attachDb(state.db);
  TeryaqPlatform.setDataChangedCallback(async()=>{
    if(!TeryaqPlatform.user())return;
    await refreshLibrary();
    // Background sync checks run every 15 seconds. Re-render only views that
    // display the local document library; rebuilding Admin while the user is
    // typing would discard the focused field and return the tab to Overview.
    if(['home','documents','templates','trash'].includes(state.view))await renderActiveView();
  });
  for(const id of ['appVersionBadge','sidebarAppVersion']){const el=byId(id);if(el)el.textContent=`v${APP_VERSION}`}
  bindGlobal();
  applySidebarPreference();
  const auth=await TeryaqPlatform.initialize();
  window.addEventListener('teryaq-authenticated',async()=>{await afterAuthentication();});
  if(auth.authenticated)await afterAuthentication();
  window.addEventListener('resize',()=>{syncEditorStickyOffsets();if(state.current?.templateId==='scientific-draft-text'){if(state.viewOnly)applyPreviewScale();else updatePageScale()}});
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
  window.addEventListener('teryaq-content-options-updated',event=>{if(event.detail)state.contentOptions=clone(event.detail);if(state.view==='editor'&&state.current){if(state.current.templateId==='scientific-draft-text')renderMeta();else renderFigureEditor()}});
  window.addEventListener('teryaq-media-progress',event=>{const record=event.detail;if(!record||state.current?.id!==record.documentId)return;const figure=state.current.content?.figures?.find(item=>item.id===record.figureId);if(figure){figure.imageStatus=record.status;figure.uploadedBytes=Number(record.uploadedBytes||0);figure.imageSize=Number(record.size||figure.imageSize||0);figure.uploadSpeed=Number(record.speed||0);figure.uploadEta=Number(record.eta||0);if(record.storagePath)figure.storagePath=record.storagePath}updateFigureUploadProgressDom(record);renderFigureUploadSummary()});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushEmergencySave();else resumeAndSync()});
  window.addEventListener('focus',()=>resumeAndSync());
  window.addEventListener('pageshow',()=>resumeAndSync());
  window.addEventListener('beforeunload',event=>{
    if(!state.current||(state.dirty===false&&state.saveInFlight===0))return;
    persistEmergencyDraft(state.current,state.editRevision);
    if(state.dirty)void saveCurrent(false);
    event.preventDefault();event.returnValue='';
  });
  setInterval(()=>{if(state.current && state.dirty && Date.now()-state.lastSnapshotAt>SNAPSHOT_INTERVAL_MS)createSnapshot('Auto snapshot')},60000);
}
async function afterAuthentication(){
  await requestPersistentStorage();await TeryaqPlatform.claimAndMigrateLegacyData();const recovered=await recoverEmergencyDrafts();state.contentOptions=await TeryaqPlatform.getContentOptions();await refreshLibrary();renderHome();await refreshUpdates();TeryaqPlatform.updateSyncUi();
  if(recovered)toast(`Recovered ${recovered} emergency draft${recovered===1?'':'s'}`);
  if(navigator.onLine)TeryaqPlatform.syncNow({silent:true});
}
let resumeSyncPromise=null;
async function resumeAndSync(){
  if(resumeSyncPromise||!TeryaqPlatform.user()||document.visibilityState==='hidden')return resumeSyncPromise;
  resumeSyncPromise=(async()=>{if(state.current&&state.dirty)await saveCurrent(false);TeryaqPlatform.scheduleAutoSync(350)})();
  try{return await resumeSyncPromise}finally{resumeSyncPromise=null}
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
  byId('closeModal').onclick=()=>closeModal();
  byId('syncBtn').onclick=()=>TeryaqPlatform.syncNow();
  byId('resolveConflictsBtn').onclick=()=>TeryaqPlatform.resolveConflicts();
  byId('bulkDeleteDocuments').onclick=()=>deleteSelectedDocumentsToTrash();byId('clearDocumentSelection').onclick=()=>{state.selectedDocumentIds.clear();renderDocuments()};
  $$('[data-nav]').forEach(button=>button.addEventListener('click',()=>activateView(button.dataset.nav)));
  const notificationsButton=byId('notificationsButton'),notificationsPanel=byId('notificationsPanel'),profileButton=byId('profileMenuButton'),profilePanel=byId('profileMenuPanel');
  notificationsButton.onclick=event=>{event.stopPropagation();const opening=notificationsPanel.classList.contains('hidden');notificationsPanel.classList.toggle('hidden',!opening);profilePanel.classList.add('hidden');notificationsButton.setAttribute('aria-expanded',String(opening));profileButton.setAttribute('aria-expanded','false');if(opening)refreshUpdates()};
  profileButton.onclick=event=>{event.stopPropagation();const opening=profilePanel.classList.contains('hidden');profilePanel.classList.toggle('hidden',!opening);notificationsPanel.classList.add('hidden');profileButton.setAttribute('aria-expanded',String(opening));notificationsButton.setAttribute('aria-expanded','false')};
  byId('topbarSignOut').onclick=async()=>{await TeryaqPlatform.signOut();location.reload()};
  for(const id of ['markUpdatesRead','dashboardMarkUpdatesRead'])byId(id).onclick=async()=>{await TeryaqPlatform.markAllUpdatesRead();await refreshUpdates()};
  byId('sidebarToggle').onclick=()=>setSidebarOpen(true);byId('sidebarClose').onclick=()=>setSidebarOpen(false);byId('sidebarScrim').onclick=()=>setSidebarOpen(false);byId('sidebarCollapse').onclick=()=>setSidebarCollapsed(!byId('appShell').classList.contains('sidebar-collapsed'));
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#exportMenu'))closeExportMenu();if(!event.target.closest('.document-action-menu-panel')&&!event.target.closest('.row-more'))closeDocumentActionMenu();if(!event.target.closest('.topbar-popover-wrap')){notificationsPanel.classList.add('hidden');profilePanel.classList.add('hidden');notificationsButton.setAttribute('aria-expanded','false');profileButton.setAttribute('aria-expanded','false')}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeExportMenu();closeDocumentActionMenu();setOutlineDrawerOpen(false);if(!byId('modal').classList.contains('hidden'))closeModal()}});
  window.addEventListener('resize',closeDocumentActionMenu);window.addEventListener('scroll',closeDocumentActionMenu,true);
}
function closeModal(){byId('modal').classList.add('hidden');byId('modal').querySelector('.modal-card')?.classList.remove('wizard-modal','docx-import-modal');state.docxImportSession=null}

// ---------------- Home/library ----------------
function setSidebarOpen(open){byId('appShell').classList.toggle('sidebar-open',open);byId('sidebarScrim').classList.toggle('hidden',!open)}
function applySidebarPreference(){let collapsed=false;try{const saved=localStorage.getItem(SIDEBAR_COLLAPSED_KEY);if(saved!==null)collapsed=saved==='true'}catch(_){}setSidebarCollapsed(collapsed,false)}
function setSidebarCollapsed(collapsed,persist=true){const shell=byId('appShell'),button=byId('sidebarCollapse');if(!shell||!button)return;shell.classList.toggle('sidebar-collapsed',collapsed);button.setAttribute('aria-expanded',String(!collapsed));button.setAttribute('aria-label',collapsed?'Expand sidebar':'Collapse sidebar');button.title=collapsed?'Expand sidebar':'Collapse sidebar';if(persist)try{localStorage.setItem(SIDEBAR_COLLAPSED_KEY,String(collapsed))}catch(_){}requestAnimationFrame(()=>{syncEditorStickyOffsets();if(state.current?.templateId==='scientific-draft-text')updatePageScale()})}
function syncEditorStickyOffsets(){const topbar=document.querySelector('.app-frame>.topbar'),ribbon=byId('leftPanel');if(topbar)document.documentElement.style.setProperty('--topbar-height',`${Math.ceil(topbar.getBoundingClientRect().height)}px`);requestAnimationFrame(()=>{if(ribbon&&!ribbon.classList.contains('hidden'))document.documentElement.style.setProperty('--editor-ribbon-height',`${Math.ceil(ribbon.getBoundingClientRect().height)}px`)})}
async function activateView(name){
  if(state.current&&name!=='editor'&&!(await ensureCurrentSaved()))return false;
  if(name!=='editor')state.current=null;
  byId('notificationsPanel')?.classList.add('hidden');byId('profileMenuPanel')?.classList.add('hidden');byId('notificationsButton')?.setAttribute('aria-expanded','false');byId('profileMenuButton')?.setAttribute('aria-expanded','false');
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
  else if(state.view==='profile')await TeryaqPlatform.showAccountPage('accountPageBody');
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
  void refreshUpdates();
}
async function refreshUpdates(){
  if(!TeryaqPlatform.user()||!TeryaqPlatform.getUpdates)return;const result=await TeryaqPlatform.getUpdates(),items=result?.items||[],unread=new Set(result?.unreadIds||[]),badge=byId('notificationBadge');badge.textContent=String(unread.size);badge.classList.toggle('hidden',!unread.size);
  const markup=items.length?items.map(item=>`<article class="update-item ${unread.has(item.id)?'unread':''}"><span class="update-dot"></span><div><b>${esc(item.title)}</b><p>${esc(item.body)}</p><small>${esc(fmtDate(item.created_at||item.createdAt))}</small></div></article>`).join(''):'<div class="empty-state compact">No updates yet.</div>';
  byId('notificationItems').innerHTML=markup;byId('dashboardUpdates').innerHTML=markup;
}
function renderDocuments(){
  closeDocumentActionMenu();
  let docs=state.docs;
  if(state.search)docs=docs.filter(d=>JSON.stringify([d.title,d.metadata?.course||d.metadata?.subject,d.metadata?.chapterTitle,d.metadata?.chapterNumber]).toLowerCase().includes(state.search));
  const status=state.view==='documents'?(byId('documentStatusFilter')?.value||''):'';if(status)docs=docs.filter(d=>(d.sync?.status||'local-only')===status);
  const visibleIds=new Set(docs.map(d=>d.id));state.selectedDocumentIds=new Set([...state.selectedDocumentIds].filter(id=>visibleIds.has(id)));
  const cardHost=byId('documentCards');if(cardHost){cardHost.innerHTML='';const recent=docs.slice(0,4);if(!recent.length)cardHost.innerHTML='<div class="empty-state"><b>No saved documents yet.</b><br>Create your first document from a template.</div>';recent.forEach(d=>cardHost.appendChild(documentCard(d)))}
  const stats=byId('documentStats');if(stats)stats.innerHTML=`<article class="stat-card"><span class="stat-icon">${uiIcon('documents')}</span><div><b>${state.docs.length}</b><small>Active</small></div></article><article class="stat-card gold"><span class="stat-icon">${uiIcon('sync')}</span><div><b>${state.docs.filter(d=>d.sync?.status==='pending').length}</b><small>Waiting sync</small></div></article><article class="stat-card wine"><span class="stat-icon">${uiIcon('conflict')}</span><div><b>${state.docs.filter(d=>d.sync?.status==='conflict').length}</b><small>Conflicts</small></div></article><article class="stat-card indigo"><span class="stat-icon">${uiIcon('local')}</span><div><b>${state.docs.filter(d=>d.sync?.status==='local-only').length}</b><small>Local only</small></div></article>`;
  updateDocumentBulkBar();const table=byId('documentsTable');if(!table)return;if(!docs.length){table.innerHTML='<div class="empty-state">No documents match these filters.</div>';return}const allSelected=docs.every(d=>state.selectedDocumentIds.has(d.id));table.innerHTML=`<table class="documents-table"><thead><tr><th class="select-col"><label class="selection-box" title="Select all visible documents"><input type="checkbox" class="documents-select-all" aria-label="Select all visible documents" ${allSelected?'checked':''}><span></span></label></th><th>Document</th><th>Template</th><th>Edited</th><th>Status</th><th>Actions</th></tr></thead><tbody>${docs.map(d=>`<tr data-doc-id="${esc(d.id)}" class="${state.selectedDocumentIds.has(d.id)?'selected-row':''}"><td class="select-col"><label class="selection-box"><input type="checkbox" class="document-select" aria-label="Select ${esc(d.title||'document')}" ${state.selectedDocumentIds.has(d.id)?'checked':''}><span></span></label></td><td class="doc-main"><b>${esc(d.title||'Untitled')}</b><small>${esc(d.metadata?.course||d.metadata?.subject||'No course')}</small></td><td>${esc(getTemplate(d.templateId)?.name||d.templateId)}</td><td>${esc(fmtDate(d.updatedAt))}</td><td><button class="chip sync-chip ${esc(d.sync?.status||'local-only')} row-status">${esc(d.sync?.status||'local-only')}</button></td><td><div class="row-actions"><button class="btn primary small row-open">Open</button><button class="btn small row-history">History & Versions</button><button class="btn small row-more" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="More actions for ${esc(d.title||'document')}">•••</button></div></td></tr>`).join('')}</tbody></table>`;
  table.querySelectorAll('.row-more').forEach(button=>button.innerHTML=uiIcon('more-horizontal'));const selectAll=table.querySelector('.documents-select-all');selectAll.indeterminate=!allSelected&&state.selectedDocumentIds.size>0;selectAll.onchange=()=>{if(selectAll.checked)docs.forEach(d=>state.selectedDocumentIds.add(d.id));else docs.forEach(d=>state.selectedDocumentIds.delete(d.id));renderDocuments()};
  table.querySelectorAll('tr[data-doc-id]').forEach(row=>{const d=state.docs.find(x=>x.id===row.dataset.docId);row.querySelector('.document-select').onchange=e=>{if(e.target.checked)state.selectedDocumentIds.add(d.id);else state.selectedDocumentIds.delete(d.id);renderDocuments()};row.querySelector('.row-open').onclick=()=>openDocument(d.id);row.querySelector('.row-history').onclick=async()=>{await openDocument(d.id);showSnapshots()};row.querySelector('.row-status').onclick=()=>d.sync?.status==='conflict'&&TeryaqPlatform.resolveConflicts(d.id);row.querySelector('.row-more').onclick=event=>{event.stopPropagation();openDocumentActionMenu(row.querySelector('.row-more'),d)}})
}
function closeDocumentActionMenu(){const active=state.documentActionMenu;if(!active)return;active.trigger?.setAttribute('aria-expanded','false');active.panel?.remove();state.documentActionMenu=null}
function openDocumentActionMenu(trigger,doc){
  if(state.documentActionMenu?.trigger===trigger){closeDocumentActionMenu();return}closeDocumentActionMenu();
  const panel=document.createElement('div');panel.className='document-action-menu-panel';panel.setAttribute('role','menu');panel.innerHTML='<button type="button" role="menuitem" class="row-duplicate">Duplicate</button><button type="button" role="menuitem" class="row-export">Export .teryaq</button><button type="button" role="menuitem" class="row-delete danger">Move to Trash</button>';document.body.appendChild(panel);state.documentActionMenu={panel,trigger};trigger.setAttribute('aria-expanded','true');
  if(innerWidth>620){const rect=trigger.getBoundingClientRect(),width=190,height=panel.offsetHeight||130,left=Math.max(10,Math.min(innerWidth-width-10,rect.right-width)),below=innerHeight-rect.bottom,top=below>=height+8?rect.bottom+6:Math.max(10,rect.top-height-6);panel.style.left=`${Math.round(left)}px`;panel.style.top=`${Math.round(top)}px`}
  panel.querySelector('.row-duplicate').onclick=()=>{closeDocumentActionMenu();duplicateDocument(doc.id)};panel.querySelector('.row-export').onclick=()=>{closeDocumentActionMenu();exportDocumentPackage(doc)};panel.querySelector('.row-delete').onclick=()=>{closeDocumentActionMenu();deleteDocumentToTrash(doc)};panel.querySelector('button')?.focus();
}
function updateDocumentBulkBar(){const bar=byId('documentBulkBar'),count=state.selectedDocumentIds.size;if(!bar)return;bar.classList.toggle('hidden',!count);byId('selectedDocumentCount').textContent=`${count} selected`}
function documentCard(d){const t=getTemplate(d.templateId),hasConflict=d.sync?.status==='conflict',course=d.metadata?.course||d.metadata?.subject||'',card=document.createElement('div');card.className=`doc-card${hasConflict?' has-conflict':''}`;card.innerHTML=`${hasConflict?'<div class="document-conflict-alert"><b>Sync conflict / تعارض مزامنة</b><span>Review this document before continuing.</span></div>':''}<h4>${esc(d.title||'Untitled')}</h4><p>${esc(t?.name||d.templateId)}${course?' · '+esc(course):''}</p><div class="meta"><span class="chip">${esc(fmtDate(d.updatedAt))}</span><span class="chip sync-chip ${esc(d.sync?.status||'local-only')}">${esc(d.sync?.status||'local-only')}</span></div><div class="card-actions"><button class="btn primary small open">Open</button>${hasConflict?'<button class="btn small resolve">Resolve conflict</button>':''}</div>`;card.querySelector('.open').onclick=()=>openDocument(d.id);card.querySelector('.resolve')?.addEventListener('click',()=>TeryaqPlatform.resolveConflicts(d.id));return card}
async function deleteDocumentToTrash(d){if(confirm(`Move “${d.title}” to Trash?`)){await snapshotDocument(d,'Before deletion');await TeryaqPlatform.queueDelete(d);state.selectedDocumentIds.delete(d.id);await refreshLibrary();await renderActiveView();toast('Moved to Trash')}}
async function deleteSelectedDocumentsToTrash(){const docs=state.docs.filter(d=>state.selectedDocumentIds.has(d.id));if(!docs.length)return;if(!confirm(`Move ${docs.length} selected document${docs.length===1?'':'s'} to Trash?`))return;const button=byId('bulkDeleteDocuments');button.disabled=true;button.textContent='Moving…';try{for(const d of docs){await snapshotDocument(d,'Before bulk deletion');await TeryaqPlatform.queueDelete(d)}state.selectedDocumentIds.clear();await refreshLibrary();await renderActiveView();toast(`${docs.length} document${docs.length===1?'':'s'} moved to Trash`)}finally{button.disabled=false;button.textContent='Move selected to Trash'}}
function renderTemplatesPage(){const host=byId('templatesPageGrid');host.innerHTML='';[...BUILTIN_TEMPLATES,...state.customTemplates].forEach(t=>{const item=document.createElement('article');item.className='template-choice-wrap';item.innerHTML=`<button class="template-choice" type="button"><span class="template-icon">${uiIcon(t.editor==='structured-form'?'figure':'text')}</span><span><strong>${esc(t.name)}</strong><small>${esc(t.description||'Reusable custom template')}</small><span class="template-meta">${esc(t.category||'Custom')} · v${esc(t.version||'1.0.0')}</span></span><span class="choice-check">${uiIcon('arrow-right')}</span></button>${t.custom?'<button class="btn danger small delete-template">Delete custom template</button>':''}`;item.querySelector('.template-choice').onclick=()=>showNewDocumentWizard(t.id);item.querySelector('.delete-template')?.addEventListener('click',async()=>{if(confirm(`Delete custom template “${t.name}”?`)){await idbDelete('templates',t.id);await refreshLibrary();renderTemplatesPage()}});host.appendChild(item)})}
function templateInformationFields(t){
  const metadata=t.custom?(t.baseDocument?.metadata||{}):(t.id==='scientific-draft-figures'?{generalNotes:''}:blankMeta()),fields=[{key:'name',label:'Author',type:'author',required:true}];
  if('startDate' in metadata)fields.push({key:'startDate',label:'Start date',type:'date',required:false});if('endDate' in metadata)fields.push({key:'endDate',label:'End date',type:'date',required:false});fields.push({key:'subject',label:'Course',type:'course',required:true},{key:'chapterNumber',label:'Chapter',type:'chapter',required:true});if('generalNotes' in metadata)fields.push({key:'generalNotes',label:'General notes',type:'textarea',required:false});return fields
}
function activeCatalog(kind){return (state.contentOptions?.[kind]||[]).filter(item=>item.active!==false).sort((a,b)=>Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.name||a.title||a.chapter_number||'').localeCompare(String(b.name||b.title||b.chapter_number||'')))}
function splitAuthorNames(value){return String(value||'').split(/[،,;]/).map(x=>x.trim()).filter(Boolean)}
function metadataCatalogReady(){return activeCatalog('authors').length&&activeCatalog('subjects').length&&activeCatalog('chapters').length}
function bindMetadataCatalogFields(ids,metadata,onChanged=()=>{}){
  const authorEl=byId(ids.author),courseEl=byId(ids.course),chapterEl=byId(ids.chapter);if(!authorEl||!courseEl||!chapterEl)return;
  const authors=activeCatalog('authors'),courses=activeCatalog('subjects'),chapters=activeCatalog('chapters');
  const chosenAuthorIds=new Set(Array.isArray(metadata.authorIds)?metadata.authorIds:[]),legacyAuthorNames=splitAuthorNames(metadata.name);if(!chosenAuthorIds.size)for(const author of authors)if(legacyAuthorNames.includes(author.name))chosenAuthorIds.add(author.id);
  const unmatchedAuthors=legacyAuthorNames.filter(name=>!authors.some(author=>author.name===name));for(const name of unmatchedAuthors)chosenAuthorIds.add(`legacy:${name}`);
  renderAuthorPicker(authorEl,authors,unmatchedAuthors,chosenAuthorIds,metadata,onChanged,{locked:!authorEl.id.startsWith('wizard-')});
  const currentCourseName=metadata.course||metadata.subject||'',matchedCourse=courses.find(course=>course.id===(metadata.courseId||metadata.subjectId)||course.name===currentCourseName);let courseId=matchedCourse?.id||'';
  courseEl.innerHTML=`<option value="">Select course…</option>${courses.map(course=>`<option value="${esc(course.id)}">${esc(course.name)}</option>`).join('')}`;
  if(currentCourseName&&!courseId){courseId=`legacy:${currentCourseName}`;courseEl.insertAdjacentHTML('beforeend',`<option value="${esc(courseId)}">${esc(currentCourseName)} (current)</option>`)}courseEl.value=courseId;if(matchedCourse){metadata.course=matchedCourse.name;metadata.subject=matchedCourse.name;metadata.courseId=matchedCourse.id;metadata.subjectId=matchedCourse.id}
  const populateChapters=(reset=false)=>{
    const selectedCourse=courseEl.value;if(reset){metadata.chapterId='';metadata.chapterNumber='';metadata.chapterTitle=''}
    const available=chapters.filter(chapter=>chapter.subject_id===selectedCourse);let chapterId=(available.some(chapter=>chapter.id===metadata.chapterId)?metadata.chapterId:'')||available.find(chapter=>chapter.chapter_number===metadata.chapterNumber&&(!metadata.chapterTitle||chapter.title===metadata.chapterTitle))?.id||'';
    const legacyChapter=metadata.chapterNumber||metadata.chapterTitle?{id:`legacy:${metadata.chapterNumber}:${metadata.chapterTitle}`,chapter_number:metadata.chapterNumber||'—',title:metadata.chapterTitle||'Current chapter'}:null;
    chapterEl.innerHTML=`<option value="">${selectedCourse?'Select chapter…':'Select a course first…'}</option>${available.map(chapter=>`<option value="${esc(chapter.id)}">${esc(chapter.chapter_number)} — ${esc(chapter.title)}</option>`).join('')}`;
    if(legacyChapter&&!chapterId){chapterId=legacyChapter.id;chapterEl.insertAdjacentHTML('beforeend',`<option value="${esc(chapterId)}">${esc(legacyChapter.chapter_number)} — ${esc(legacyChapter.title)} (current)</option>`)}
    chapterEl.value=chapterId;chapterEl.disabled=!selectedCourse||(!available.length&&!legacyChapter)
  };
  courseEl.onchange=()=>{const course=courses.find(item=>item.id===courseEl.value),name=course?.name||(courseEl.value.startsWith('legacy:')?(courseEl.selectedOptions[0]?.textContent||'').replace(/ \(current\)$/,''):'');metadata.courseId=course?.id||'';metadata.subjectId=metadata.courseId;metadata.course=name;metadata.subject=name;populateChapters(true);onChanged('course')};
  chapterEl.onchange=()=>{const chapter=chapters.find(item=>item.id===chapterEl.value);metadata.chapterId=chapter?.id||'';if(chapter){metadata.chapterNumber=chapter.chapter_number;metadata.chapterTitle=chapter.title}else if(!chapterEl.value){metadata.chapterNumber='';metadata.chapterTitle=''}onChanged('chapter')};populateChapters(false)
}
function renderAuthorPicker(host,authors,legacyNames,selectedIds,metadata,onChanged,{locked=false}={}){
  const all=[...authors.map(author=>({id:author.id,name:author.name,legacy:false})),...legacyNames.map(name=>({id:`legacy:${name}`,name,legacy:true}))],selectedNames=()=>all.filter(item=>selectedIds.has(item.id)).map(item=>item.name);
  const commit=ids=>{selectedIds.clear();ids.forEach(id=>selectedIds.add(id));const selected=all.filter(item=>selectedIds.has(item.id));metadata.authorIds=selected.filter(item=>!item.legacy).map(item=>item.id);metadata.name=selected.map(item=>item.name).join('، ');onChanged('name')};
  const draw=editing=>{
    if(!all.length){host.innerHTML='<div class="author-picker-empty">Admin has not added authors yet.</div>';return}
    if(locked&&!editing){const names=selectedNames();host.innerHTML=`<div class="author-picker-summary"><div class="author-chips">${names.length?names.map(name=>`<span>${esc(name)}</span>`).join(''):'<small>No author selected</small>'}</div><button class="btn small author-edit" type="button">Edit</button></div>`;host.querySelector('.author-edit').onclick=()=>draw(true);return}
    const working=new Set(selectedIds);host.innerHTML=`<div class="author-check-list">${all.map(item=>`<label><input type="checkbox" value="${esc(item.id)}" ${working.has(item.id)?'checked':''}><span>${esc(item.name)}${item.legacy?' (current)':''}</span></label>`).join('')}</div>${locked?'<div class="author-picker-actions"><button class="btn small author-cancel" type="button">Cancel</button><button class="btn primary small author-save" type="button">Save changes</button></div>':''}`;
    host.querySelectorAll('input').forEach(input=>input.onchange=()=>{if(input.checked)working.add(input.value);else working.delete(input.value);if(!locked)commit(working)});
    if(locked){host.querySelector('.author-cancel').onclick=()=>draw(false);host.querySelector('.author-save').onclick=()=>{commit(working);draw(false)}}
  };draw(false)
}
function wizardFieldMarkup(field){
  const common=`id="wizard-${esc(field.key)}" data-key="${esc(field.key)}" data-field-type="${esc(field.type)}"`;
  if(field.type==='textarea')return `<textarea ${common} rows="4"></textarea>`;
  if(field.type==='author')return `<div ${common} class="author-picker-host" aria-label="Authors"></div><small class="field-hint">Select one or more authors.</small>`;
  if(['course','chapter'].includes(field.type))return `<select ${common}></select>${field.type==='chapter'?'<small class="field-hint">Only chapters from the selected course appear here.</small>':''}`;
  return `<input ${common} type="${field.type}" ${field.required?'required':''}>`
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
  const renderInformation=t=>{const fields=templateInformationFields(t),metadata={name:'',authorIds:[],course:'',courseId:'',subject:'',subjectId:'',chapterNumber:'',chapterTitle:'',chapterId:''};body.innerHTML=`<section class="wizard-page-card"><div class="wizard-head"><div><span class="eyebrow">New document</span><h3>${esc(t.informationTitle||'Draft information')}</h3><p>Choose the course first, then choose one of its chapters.</p></div><div class="wizard-steps"><span>1 · Template</span><span class="active">2 · Information</span></div></div><div class="selected-template-summary"><b>${esc(t.name)}</b><span>${esc(t.category||'Custom')}</span></div>${metadataCatalogReady()?'':'<div class="issue warn">Some content lists are empty. Ask an administrator to add authors, courses, and chapters first.</div>'}<form class="wizard-form" id="documentInfoForm">${fields.map(f=>`<div class="field${f.type==='textarea'||f.type==='chapter'?' span-2':''}"><label for="wizard-${esc(f.key)}">${f.type==='date'?uiIcon('date'):''}${esc(f.label)}${f.required?' *':''}</label>${wizardFieldMarkup(f)}</div>`).join('')}<div class="wizard-footer span-2"><button class="btn" type="button" id="wizardBack">← Back</button><button class="btn primary" type="submit">Create & continue</button></div></form></section>`;bindMetadataCatalogFields({author:'wizard-name',course:'wizard-subject',chapter:'wizard-chapterNumber'},metadata);byId('wizardBack').onclick=renderChoice;byId('documentInfoForm').onsubmit=async e=>{e.preventDefault();for(const field of fields.filter(f=>!['author','course','chapter'].includes(f.type))){const el=byId(`wizard-${field.key}`);metadata[field.key]=el?.value?.trim?.()||''}if(!metadata.name)return toast('Select at least one author');if(!metadata.courseId)return toast('Select a course');if(!metadata.chapterId)return toast('Select a chapter');await createFromTemplate(t,metadata)}};
  renderChoice();
}
async function createFromTemplate(t,metadata={}){
  let doc;
  if(t.custom){doc=clone(t.baseDocument);doc.id=uid('doc');doc.createdAt=doc.updatedAt=nowIso();doc.title=t.name+' - New';}
  else doc=t.newDocument();
  doc.metadata={...(doc.metadata||{}),...metadata};doc.title=[doc.metadata.course||doc.metadata.subject,doc.metadata.chapterNumber?`CH ${doc.metadata.chapterNumber}`:'',doc.metadata.chapterTitle,doc.templateId==='scientific-draft-figures'?'Figures':''].filter(Boolean).join(' — ')||(t.name+' - New');
  TeryaqPlatform.decorateNewDocument(doc);
  await idbPut('documents',doc);await TeryaqPlatform.queueDocument(doc);await refreshLibrary();openDocument(doc.id);
}
async function duplicateDocument(id){const d=await idbGet('documents',id);if(!d)return;const c=clone(d);c.id=uid('doc');c.title=(d.title||'Document')+' Copy';c.createdAt=c.updatedAt=nowIso();TeryaqPlatform.decorateNewDocument(c);await idbPut('documents',c);await TeryaqPlatform.queueDocument(c);await refreshLibrary();await renderActiveView();toast('Duplicated');}
async function openDocument(id){const d=await idbGet('documents',id);if(!d)return;state.current=d;state.dirty=false;state.editRevision=0;state.savedRevision=0;state.ribbonTab='styles';state.viewOnly=false;state.viewZoom=1;state.pageView='one';state.activeTableId=null;state.activeCell=null;resetHistory();await activateView('editor');renderEditor();pushHistory('Open');}
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
    if(result?.ok&&!result?.pending&&stored?.sync?.status==='synced'){
      const version=Number(stored.sync.baseServerVersion||0);setSaveStatus(version?`Saved locally ✓ · cloud version ${version} ✓`:'Saved locally ✓ · synced ✓');toast(version?`Synced · cloud version ${version}`:'Synced ✓')
    }else if(result?.mediaPending)setSaveStatus(`Saved locally ✓ · ${result.mediaPending} image upload${result.mediaPending===1?'':'s'} pending`);
    else if(stored?.sync?.status==='conflict')setSaveStatus('Saved locally ✓ · sync conflict needs review');
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
  byId('saveBtn').onclick=()=>saveCurrent(true);byId('validateBtn').onclick=()=>showValidation();byId('historyBtn').onclick=()=>showSnapshots();bindExportMenu();
  byId('syncBtnEditor').onclick=()=>saveAndSyncCurrent();byId('settingsBtnEditor').onclick=()=>activateView('settings');byId('editorImportBtn').onclick=()=>byId('importFile').click();updateEditorLocks();
}
function bindExportMenu(){
  const trigger=byId('exportMenuButton');if(!trigger)return;
  trigger.onclick=event=>{event.stopPropagation();const panel=byId('exportMenuPanel'),open=panel.classList.contains('hidden');panel.classList.toggle('hidden',!open);trigger.setAttribute('aria-expanded',String(open));if(open)panel.querySelector('[role="menuitem"]')?.focus()};
  byId('backupBtn').onclick=async()=>{closeExportMenu();if(!ensureFigureExportReady())return;if(await saveCurrent(true))exportDocumentPackage(state.current)};
  byId('printBtn').onclick=()=>{closeExportMenu();if(!ensureFigureExportReady())return;void saveCurrent(false);printCurrent()};
  byId('saveTemplateBtn').onclick=async()=>{closeExportMenu();if(!ensureFigureExportReady())return;if(await saveCurrent(true))saveAsTemplate()};
  byId('htmlExportBtn').onclick=async()=>{closeExportMenu();if(!ensureFigureExportReady())return;if(await saveCurrent(true))await exportStandaloneHtml()};
}
function closeExportMenu(){const panel=byId('exportMenuPanel'),trigger=byId('exportMenuButton');if(panel)panel.classList.add('hidden');if(trigger)trigger.setAttribute('aria-expanded','false')}


// ---------------- Text editor render ----------------
function renderTextEditor(resetSelection=true){
  const d=state.current;renderMeta();renderBlocks();renderOutline();renderRegisters();observeWritingPage();if(resetSelection){state.activeBlockId=d.content.blocks[0]?.id||null;state.selectionBookmark=null;}bindTextControls();setRibbonTab(state.ribbonTab||'styles');updateTableTabAvailability();applyViewOnlyState();requestAnimationFrame(()=>{syncEditorStickyOffsets();updatePageScale()});
}
function renderMeta(){
  const m=state.current.metadata||blankMeta();
  state.current.metadata=m;bindMetadataCatalogFields({author:'metaName',course:'metaCourse',chapter:'metaChapter'},m,()=>{updateDocumentTitle();markDirty();renderRegisters()});
  for(const [id,key] of [['metaStart','startDate'],['metaEnd','endDate'],['metaNotes','generalNotes']]){const el=byId(id);el.value=m[key]||'';el.oninput=()=>{m[key]=el.value;markDirty()}}
}
function updateDocumentTitle(){const m=state.current.metadata;state.current.title=[m.course||m.subject,m.chapterNumber?`CH ${m.chapterNumber}`:'',m.chapterTitle].filter(Boolean).join(' — ')||'Untitled Scientific Draft';byId('docTitle').textContent=state.current.title}
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
    el.classList.add('bullet-block',`level-${block.level}`);const m=document.createElement('span');m.className='bullet-marker';m.innerHTML=uiIcon(`bullet-${block.level}`);el.appendChild(m);el.appendChild(editableForBlock(block));
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
function setActiveBlock(id){state.activeBlockId=id;const block=getBlock(id);if(block?.type!=='table'){state.activeTableId=null;state.activeCell=null;$$('.selected-cell').forEach(x=>x.classList.remove('selected-cell'));updateTableTabAvailability()}$$('.doc-block.active').forEach(x=>x.classList.remove('active'));const el=document.querySelector(`[data-block-id="${CSS.escape(id)}"]`);if(el)el.classList.add('active')}
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
  bindToolbarSafe(byId('numberBtn'),()=>convertToNumber());bindToolbarSafe(byId('mainFigBtn'),()=>insertFigurePlaceholder('main'));bindToolbarSafe(byId('marginFigBtn'),()=>insertFigurePlaceholder('margin'));bindToolbarSafe(byId('newTableBtn'),()=>insertTable());bindToolbarSafe(byId('importDocxTableBtn'),()=>showDocxImportDialog());
  bindToolbarSafe(byId('boldBtn'),()=>applyMark('bold'));bindToolbarSafe(byId('italicBtn'),()=>applyMark('italic'));byId('fontSizeSelect').onpointerdown=()=>captureSelection();byId('fontSizeSelect').onchange=()=>{const v=byId('fontSizeSelect').value;if(v)applyMark(`font:${v}`);byId('fontSizeSelect').value=''};
  for(const [id,action] of [['rowUpBtn','rowAbove'],['rowDownBtn','rowBelow'],['colLeftBtn','colLeft'],['colRightBtn','colRight'],['delRowBtn','delRow'],['delColBtn','delCol'],['deleteTableBtn','deleteTable'],['equalColsBtn','equalCols']])bindToolbarSafe(byId(id),()=>tableAction(action));
  bindToolbarSafe(byId('applyColWidthBtn'),()=>tableAction('setWidth',+byId('colWidthInput').value));
  $$('[data-action="undo"]').forEach(b=>bindToolbarSafe(b,undo));$$('[data-action="redo"]').forEach(b=>bindToolbarSafe(b,redo));
  byId('mobileControlsToggle').onclick=()=>{byId('leftPanel').classList.toggle('mobile-open');requestAnimationFrame(syncEditorStickyOffsets)};
  $$('[data-ribbon-tab]').forEach(button=>button.onclick=()=>!button.disabled&&setRibbonTab(button.dataset.ribbonTab));
  byId('outlineViewBtn').onclick=()=>setOutlineDrawerOpen(!byId('rightPanel').classList.contains('drawer-open'));byId('outlineCloseBtn').onclick=()=>setOutlineDrawerOpen(false);byId('outlineScrim').onclick=()=>setOutlineDrawerOpen(false);
  byId('viewOnlyBtn').onclick=()=>{state.viewOnly=!state.viewOnly;if(state.viewOnly){state.ribbonTab='view';state.viewZoom=1;setOutlineDrawerOpen(false)}applyViewOnlyState();setRibbonTab(state.viewOnly?'view':'styles')};
  byId('zoomOutBtn').onclick=()=>setViewZoom(state.viewZoom-.1);byId('zoomInBtn').onclick=()=>setViewZoom(state.viewZoom+.1);byId('zoomResetBtn').onclick=()=>setViewZoom(1);
  byId('onePageBtn').onclick=()=>setPageView('one');
  byId('twoPagesBtn').onclick=()=>setPageView('two');
}
function setRibbonTab(name){
  const tableButton=document.querySelector('[data-ribbon-tab="table"]');if(name==='table'&&tableButton?.disabled)name='styles';if(state.viewOnly&&name!=='view')name='view';state.ribbonTab=name;
  $$('[data-ribbon-tab]').forEach(button=>{const active=button.dataset.ribbonTab===name;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active))});
  $$('[data-ribbon-panel]').forEach(panel=>panel.hidden=panel.dataset.ribbonPanel!==name);const toggle=byId('mobileControlsToggle');if(toggle)toggle.querySelector('span').textContent=`${document.querySelector(`[data-ribbon-tab="${name}"]`)?.textContent.trim()||'Editing'} tools`;if(innerWidth<=820)byId('leftPanel').classList.add('mobile-open');requestAnimationFrame(syncEditorStickyOffsets)
}
function updateTableTabAvailability(){const button=document.querySelector('[data-ribbon-tab="table"]'),available=!!(state.activeTableId&&state.activeCell);if(!button)return;button.disabled=!available;button.title=available?'Edit the selected table':'Select a table cell to use table tools';if(!available&&state.ribbonTab==='table')setRibbonTab('styles')}
function setOutlineDrawerOpen(open){const panel=byId('rightPanel'),button=byId('outlineViewBtn'),scrim=byId('outlineScrim');if(!panel||!button||!scrim)return;panel.classList.toggle('drawer-open',open);button.setAttribute('aria-expanded',String(open));scrim.classList.toggle('hidden',!open)}
function applyViewOnlyState(){const area=byId('textEditorArea'),button=byId('viewOnlyBtn'),editor=byId('editorContentColumn'),preview=byId('printPreviewWorkspace');if(!area||!button||!editor||!preview)return;area.classList.toggle('view-only-mode',state.viewOnly);document.body.classList.toggle('document-view-only',state.viewOnly);button.setAttribute('aria-pressed',String(state.viewOnly));button.classList.toggle('primary',state.viewOnly);button.textContent=state.viewOnly?'✓ View only':'◉ View only';area.querySelectorAll('.editable,.table-cell-editor').forEach(el=>el.contentEditable=state.viewOnly?'false':'true');area.querySelectorAll('.draft-information-card input,.draft-information-card textarea,.draft-information-card select,.table-information-card input').forEach(el=>{if(el.matches('select'))el.disabled=state.viewOnly;else el.readOnly=state.viewOnly});editor.classList.toggle('hidden',state.viewOnly);preview.classList.toggle('hidden',!state.viewOnly);$$('[data-ribbon-tab="styles"],[data-ribbon-tab="formatting"],[data-ribbon-tab="insert"],[data-ribbon-tab="table"]').forEach(tab=>tab.disabled=state.viewOnly||(tab.dataset.ribbonTab==='table'&&!(state.activeTableId&&state.activeCell)));updatePageViewButtons();if(state.viewOnly)renderPrintPreview();else requestAnimationFrame(updatePageScale)}
function setViewZoom(value){state.viewZoom=Math.max(.5,Math.min(1.5,Math.round(value*10)/10));const label=byId('zoomResetBtn');if(label)label.textContent=`${Math.round(state.viewZoom*100)}%`;requestAnimationFrame(()=>state.viewOnly?applyPreviewScale():updatePageScale())}
function setPageView(mode){if(mode==='two'&&innerWidth<=900){state.pageView='one';toast('Two pages is available on wider laptop screens. Mobile keeps one A4 page without reflow.')}else state.pageView=mode==='two'?'two':'one';if(!state.viewOnly){state.viewOnly=true;state.ribbonTab='view';applyViewOnlyState();setRibbonTab('view')}updatePageViewButtons();requestAnimationFrame(applyPreviewScale)}
function updatePageViewButtons(){const effective=state.pageView==='two'&&innerWidth>900?'two':'one';byId('onePageBtn')?.setAttribute('aria-pressed',String(effective==='one'));byId('twoPagesBtn')?.setAttribute('aria-pressed',String(effective==='two'));byId('onePageBtn')?.classList.toggle('primary',effective==='one');byId('twoPagesBtn')?.classList.toggle('primary',effective==='two')}
function newPreviewPage(kind='content'){
  const host=byId('printPreviewPages'),shell=document.createElement('div'),page=document.createElement('section'),content=document.createElement('div');shell.className='print-preview-page-shell';shell.dataset.previewKind=kind;page.className=`print-preview-page preview-${kind}`;content.className='print-preview-page-content';page.appendChild(content);shell.appendChild(page);host.appendChild(shell);return content
}
function currentPreviewContent(kind='content'){const shells=byId('printPreviewPages')?.querySelectorAll('.print-preview-page-shell'),last=shells?.[shells.length-1];return last?.dataset.previewKind===kind?last.querySelector('.print-preview-page-content'):newPreviewPage(kind)}
function previewOverflow(content){return content.scrollHeight>content.clientHeight+2}
function appendPreviewNode(node,kind='content'){
  let content=currentPreviewContent(kind);content.appendChild(node);if(previewOverflow(content)&&content.children.length>1){node.remove();content=newPreviewPage(kind);content.appendChild(node)}return content
}
function createPreviewTable(headerCells=[],className='preview-register-table'){
  const table=document.createElement('table');table.className=className;if(headerCells.length){const head=document.createElement('thead'),row=document.createElement('tr');headerCells.forEach(label=>{const th=document.createElement('th');th.textContent=label;row.appendChild(th)});head.appendChild(row);table.appendChild(head)}const body=document.createElement('tbody');table.appendChild(body);return {table,body}
}
function appendPreviewRows(rows,headers=[],kind='cover',className='preview-register-table'){
  let content=currentPreviewContent(kind),parts=createPreviewTable(headers,className);content.appendChild(parts.table);
  for(const cells of rows){const row=document.createElement('tr');cells.forEach((value,index)=>{const cell=document.createElement(index===0&&className==='preview-meta-table'?'th':'td');cell.innerHTML=value;row.appendChild(cell)});parts.body.appendChild(row);if(previewOverflow(content)){row.remove();content=newPreviewPage(kind);parts=createPreviewTable(headers,className);content.appendChild(parts.table);parts.body.appendChild(row)}}
}
function previewBlockNode(block,ctx){
  const node=document.createElement('div'),direction=textDirection(plainText(block.runs||[]));node.dataset.sourceBlockId=block.id;node.setAttribute('dir',direction);node.className='preview-document-block';
  if(block.type==='paragraph'){node.classList.add(`p-${block.style||'Normal'}`);if(block.style==='Heading1'||block.style==='Heading2'){node.innerHTML=`<span class="heading-num">${block.style==='Heading1'?ctx.h1:ctx.h2}.</span><span class="heading-text">${runsPrintHtml(block.runs)}</span>`}else node.innerHTML=runsPrintHtml(block.runs)}
  else if(block.type==='bullet'){node.classList.add('bullet-block',`level-${block.level}`);node.innerHTML=`<span class="bullet-marker">${uiIcon(`bullet-${block.level}`)}</span><div>${runsPrintHtml(block.runs)}</div>`}
  else if(block.type==='number'){node.classList.add('number-block');node.innerHTML=`<span class="bullet-marker">${ctx.numSeq}.</span><div>${runsPrintHtml(block.runs)}</div>`}
  else if(block.type==='figure_placeholder'){node.classList.add('figure-placeholder');node.textContent=`[POSITION OF ${block.placement==='margin'?'MARGIN ':''}FIGURE ${block.code||'?'}]`}
  return node
}
function appendPreviewDocumentTable(block){
  const kind='content',rows=block.rows||[];let content=currentPreviewContent(kind),tableParts=createPreviewTable([], 'doc-table preview-doc-table');tableParts.table.dataset.sourceBlockId=block.id;content.appendChild(tableParts.table);const header=block.headerRow!==false?rows[0]:null;
  const appendRow=(rowData,rowIndex)=>{const row=document.createElement('tr'),tag=block.headerRow!==false&&rowIndex===0?'th':'td';rowData.forEach((cell,index)=>{const td=document.createElement(tag);if(block.widths?.[index])td.style.width=`${block.widths[index]}%`;td.innerHTML=runsPrintHtml(cell.runs);row.appendChild(td)});tableParts.body.appendChild(row);if(previewOverflow(content)){row.remove();content=newPreviewPage(kind);tableParts=createPreviewTable([], 'doc-table preview-doc-table');tableParts.table.dataset.sourceBlockId=block.id;content.appendChild(tableParts.table);if(header&&rowIndex>0){const repeated=document.createElement('tr');header.forEach((cell,index)=>{const th=document.createElement('th');if(block.widths?.[index])th.style.width=`${block.widths[index]}%`;th.innerHTML=runsPrintHtml(cell.runs);repeated.appendChild(th)});tableParts.body.appendChild(repeated)}tableParts.body.appendChild(row)}};
  rows.forEach(appendRow);const caption=tableCaptionText(block);if(caption){const cap=document.createElement('div');cap.className='preview-table-caption';cap.textContent=caption;appendPreviewNode(cap,kind)}
}
function renderPrintPreview(){
  if(!state.current||!state.viewOnly)return;const host=byId('printPreviewPages');if(!host)return;host.innerHTML='';const d=state.current,m=d.metadata||{},headings=headingStructure(),tables=d.content.blocks.filter(block=>block.type==='table');newPreviewPage('cover');
  appendPreviewRows([['Name',esc(m.name||'')],['Start date',esc(m.startDate||'')],['End date',esc(m.endDate||'')],['Course',esc(m.course||m.subject||'')],['Chapter number',esc(m.chapterNumber||'')],['Chapter title',esc(m.chapterTitle||'')]],[],'cover','preview-meta-table');
  appendPreviewRows(Array.from({length:Math.max(12,headings.length)},(_,index)=>[String(index+1),esc(headings[index]?.title||'')]),['Headings 1',''],'cover','preview-register-table');
  appendPreviewRows(tables.length?tables.map(table=>[esc(table.code||''),esc(table.title||''),esc(table.caption||'')]):[['','','']],['Table code','Table title','Table caption'],'cover','preview-register-table');
  newPreviewPage('content');let h1=0,h2=0,numSeq=0;for(const block of d.content.blocks){if(block.type==='paragraph'&&block.style==='Heading1'){h1++;h2=0;numSeq=0}else if(block.type==='paragraph'&&block.style==='Heading2'){h2++;numSeq=0}else if(block.type!=='number')numSeq=0;if(block.type==='number')numSeq++;if(block.type==='table')appendPreviewDocumentTable(block);else appendPreviewNode(previewBlockNode(block,{h1,h2,numSeq}),'content')}
  host.querySelectorAll('.print-preview-page').forEach((page,index)=>{const label=document.createElement('span');label.className='print-preview-page-number';label.textContent=String(index+1);page.appendChild(label)});const ready=document.fonts?.ready||Promise.resolve();ready.then(()=>requestAnimationFrame(applyPreviewScale));updatePageViewButtons()
}
function applyPreviewScale(){
  if(!state.viewOnly)return;const host=byId('printPreviewPages'),workspace=byId('printPreviewWorkspace');if(!host||!workspace)return;const baseWidth=793.7,baseHeight=1122.5,gap=18,columns=state.pageView==='two'&&innerWidth>900?2:1,available=Math.max(280,workspace.clientWidth-24),fit=Math.min(1,(available-gap*(columns-1))/(baseWidth*columns)),scale=Math.max(.35,Math.min(1.5,fit*state.viewZoom));host.classList.toggle('two-pages',columns===2);host.classList.toggle('one-page',columns===1);host.style.gridTemplateColumns=`repeat(${columns}, ${Math.round(baseWidth*scale)}px)`;host.querySelectorAll('.print-preview-page-shell').forEach(shell=>{shell.style.width=`${Math.round(baseWidth*scale)}px`;shell.style.height=`${Math.round(baseHeight*scale)}px`;const page=shell.querySelector('.print-preview-page');page.style.transform=`scale(${scale})`});const label=byId('zoomResetBtn');if(label)label.textContent=`${Math.round(state.viewZoom*100)}%`
}
function applyParagraphStyle(style){
  const b=getBlock();if(!b)return toast('Click in a paragraph first');if(b.type==='figure_placeholder'||b.type==='table')return toast('Select a text block first');
  if(!STYLE_CONTRACT[style])return;
  if(b.type!=='paragraph'){b.type='paragraph';delete b.level;}b.style=style;
  // A paragraph preset owns its whole appearance; old inline formatting must not override it.
  b.runs=normalizeRuns((b.runs||[]).map(r=>({text:r.text,marks:(r.marks||[]).filter(m=>!VISUAL_STYLE_MARKS.includes(m)&&!m.startsWith('font:'))})));
  markDirty(false);pushHistory(`Style ${style}`);renderBlocks();renderOutline();renderRegisters();setTimeout(()=>focusBlock(b.id,plainText(b.runs).length),0);
}
function applyMark(mark){
  const b=getBlock();if(!b||!['paragraph','bullet','number'].includes(b.type))return toast('Select text first');if(!state.selectionBookmark||state.selectionBookmark.blockId!==b.id||state.selectionBookmark.start===state.selectionBookmark.end)return toast('Select text first');
  const start=Math.min(state.selectionBookmark.start,state.selectionBookmark.end),end=Math.max(state.selectionBookmark.start,state.selectionBookmark.end);
  b.runs=VISUAL_STYLE_MARKS.includes(mark)?applyNamedStyleToRuns(b.runs,start,end,mark):applyMarkToRuns(b.runs,start,end,mark);
  markDirty(false);pushHistory(`Format ${mark}`);renderBlocks();setTimeout(()=>{state.selectionBookmark={blockId:b.id,start,end};restoreSelection()},0);
}
const VISUAL_STYLE_MARKS=['SideNote','NotesToDelete','HighYield','ClinicalCorrelation','bold','italic'];
function applyNamedStyleToRuns(runs,start,end,style){
  const out=[];let pos=0;
  for(const r of runs||[]){
    const a=pos,b=pos+r.text.length;pos=b;
    if(end<=a||start>=b){out.push(clone(r));continue}
    const s=Math.max(start,a)-a,e=Math.min(end,b)-a,marks=r.marks||[];
    if(s)out.push({text:r.text.slice(0,s),marks:[...marks]});
    out.push({text:r.text.slice(s,e),marks:[...marks.filter(m=>!VISUAL_STYLE_MARKS.includes(m)&&!m.startsWith('font:')),style]});
    if(e<r.text.length)out.push({text:r.text.slice(e),marks:[...marks]});
  }
  return normalizeRuns(out);
}
function applyMarkToRuns(runs,start,end,mark){
  const out=[];let pos=0;const isFont=mark.startsWith('font:');
  for(const r of runs||[]){const a=pos,b=pos+r.text.length;if(end<=a||start>=b){out.push(clone(r));pos=b;continue}const s=Math.max(start,a)-a,e=Math.min(end,b)-a;const before=r.text.slice(0,s),mid=r.text.slice(s,e),after=r.text.slice(e);if(before)out.push({text:before,marks:[...(r.marks||[])]});if(mid){let marks=[...(r.marks||[])];if(isFont)marks=marks.filter(x=>!x.startsWith('font:'));if(marks.includes(mark))marks=marks.filter(x=>x!==mark);else marks.push(mark);out.push({text:mid,marks});}if(after)out.push({text:after,marks:[...(r.marks||[])]});pos=b;}
  return normalizeRuns(out);
}
function convertToBullet(level){const b=getBlock();if(!b||b.type==='table'||b.type==='figure_placeholder')return;b.type='bullet';b.level=level;delete b.style;markDirty(false);pushHistory(`Bullet ${level}`);renderBlocks();renderOutline();renderRegisters();setTimeout(()=>focusBlock(b.id,plainText(b.runs||[]).length),0)}
function convertToNumber(){const b=getBlock();if(!b||b.type==='table'||b.type==='figure_placeholder')return;b.type='number';delete b.style;delete b.level;markDirty(false);pushHistory('Numbered item');renderBlocks();renderOutline();renderRegisters();setTimeout(()=>focusBlock(b.id,plainText(b.runs||[]).length),0)}
function insertFigurePlaceholder(placement){const raw=prompt(`${placement==='margin'?'Margin f':'F'}igure code (numbers and dots only, e.g., 3.1):`,'');if(raw===null)return;const code=sanitizeNumericCode(raw);if(!code)return toast('Figure code must contain numbers and dots only');const b={id:uid('b'),type:'figure_placeholder',placement,code};insertBlockAfterActive(b);}
function insertBlockAfterActive(block){const arr=state.current.content.blocks;let idx=arr.findIndex(x=>x.id===state.activeBlockId);if(idx<0)idx=arr.length-1;arr.splice(idx+1,0,block);markDirty(false);pushHistory('Insert block');renderBlocks();renderOutline();renderRegisters();setActiveBlock(block.id)}

// ---------------- Tables ----------------
function insertTable(){
  const rowInput=prompt('Rows:','3');if(rowInput===null)return;const colInput=prompt('Columns:','3');if(colInput===null)return;
  const rows=Math.max(2,Math.min(20,+rowInput||3)),cols=Math.max(2,Math.min(8,+colInput||3));const rawCode=prompt('Table code (numbers and dots only):','');if(rawCode===null)return;const code=sanitizeNumericCode(rawCode);const title=prompt('Table title:','');if(title===null)return;const caption=prompt('Table caption (optional):','');if(caption===null)return;
  if(!code||!title.trim())return toast('A numeric Table code and Table title are required');
  const block={id:uid('tbl'),type:'table',code,title:title.trim(),caption:caption.trim(),headerRow:true,widths:Array(cols).fill(100/cols),rows:Array.from({length:rows},()=>Array.from({length:cols},()=>({runs:[]})))},arr=state.current.content.blocks;let idx=arr.findIndex(x=>x.id===state.activeBlockId);if(idx<0)idx=arr.length-1;arr.splice(idx+1,0,block);const next=arr[idx+2];if(!next||!['paragraph','bullet','number'].includes(next.type))arr.splice(idx+2,0,normalBlock());markDirty(false);pushHistory('Insert table');renderBlocks();renderOutline();renderRegisters();setActiveBlock(block.id)
}
function tableCaptionText(block){const lead=['Table',String(block.code||'').trim()].filter(Boolean).join(' '),title=String(block.title||'').trim(),caption=String(block.caption||'').trim();return `${lead}${lead&&title?' — ':''}${title}${caption?`${lead||title?' · ':''}${caption}`:''}`.trim()}
function refreshRenderedTableCaption(block){const caption=document.querySelector(`[data-block-id="${CSS.escape(block.id)}"] .table-caption`);if(caption)caption.textContent=tableCaptionText(block)}
function renderTable(block){
  const wrap=document.createElement('div');const sc=document.createElement('div');sc.className='table-wrap';const table=document.createElement('table');table.className='doc-table';table.dataset.tableId=block.id;const body=document.createElement('tbody');
  block.rows.forEach((row,ri)=>{const tr=document.createElement('tr');row.forEach((cell,ci)=>{const td=document.createElement(block.headerRow!==false&&ri===0?'th':'td');if(block.widths?.[ci])td.style.width=block.widths[ci]+'%';const ed=document.createElement('div');ed.className='table-cell-editor';ed.contentEditable='true';ed.setAttribute('dir','auto');ed.innerHTML=runsToHtml(cell.runs||[]);ed.addEventListener('focus',()=>selectTableCell(block.id,ri,ci,td));ed.addEventListener('click',()=>selectTableCell(block.id,ri,ci,td));ed.addEventListener('input',()=>{cell.runs=elementToRuns(ed);selectTableCell(block.id,ri,ci,td);markDirty()});ed.addEventListener('paste',e=>{e.preventDefault();insertPlainTextAtSelection(ed,(e.clipboardData||window.clipboardData).getData('text/plain'));cell.runs=elementToRuns(ed);markDirty()});td.appendChild(ed);tr.appendChild(td)});body.appendChild(tr)});table.appendChild(body);sc.appendChild(table);wrap.appendChild(sc);
  const cap=document.createElement('div');cap.className='table-caption';cap.textContent=tableCaptionText(block);wrap.appendChild(cap);const continueButton=document.createElement('button');continueButton.type='button';continueButton.className='table-continue-button';continueButton.innerHTML='<span aria-hidden="true">＋</span> Continue writing';continueButton.addEventListener('pointerdown',e=>{e.preventDefault();continueWritingAfterTable(block.id)});wrap.appendChild(continueButton);return wrap;
}
function continueWritingAfterTable(tableId){const arr=state.current.content.blocks,idx=arr.findIndex(b=>b.id===tableId);if(idx<0)return;let next=arr[idx+1];if(!next||!['paragraph','bullet','number'].includes(next.type)){next=normalBlock();arr.splice(idx+1,0,next);markDirty(false);pushHistory('Continue after table');renderBlocks();renderOutline();renderRegisters()}setTimeout(()=>focusBlock(next.id,0),0)}
function selectTableCell(tableId,row,col,td){state.activeTableId=tableId;state.activeCell={row,col};state.activeBlockId=tableId;$$('.selected-cell').forEach(x=>x.classList.remove('selected-cell'));td?.classList.add('selected-cell');updateTableTabAvailability();if(!state.viewOnly)setRibbonTab('table')}
function tableAction(action,value){const t=getBlock(state.activeTableId);if(!t||t.type!=='table'||!state.activeCell)return toast('Click inside a table cell first');let {row,col}=state.activeCell;const cols=t.rows[0]?.length||0;
  if(action==='deleteTable'){if(!confirm(`Delete Table ${t.code||''}${t.title?` — ${t.title}`:''}?`))return;const arr=state.current.content.blocks,index=arr.findIndex(block=>block.id===t.id);arr.splice(index,1);if(!arr.length)arr.push(normalBlock());state.activeTableId=null;state.activeCell=null;state.activeBlockId=arr[Math.max(0,index-1)]?.id||arr[0]?.id||null;markDirty(false);pushHistory('Delete table');renderBlocks();renderOutline();renderRegisters();updateTableTabAvailability();setRibbonTab('styles');toast('Table deleted · Undo is available');return}
  if(action==='rowAbove')t.rows.splice(row,0,Array.from({length:cols},()=>({runs:[]})));
  if(action==='rowBelow')t.rows.splice(row+1,0,Array.from({length:cols},()=>({runs:[]})));
  if(action==='delRow'){if(t.rows.length<=1)return toast('Table must keep at least one row');t.rows.splice(row,1);row=Math.max(0,row-1)}
  if(action==='colLeft'||action==='colRight'){const at=action==='colLeft'?col:col+1;t.rows.forEach(r=>r.splice(at,0,{runs:[]}));t.widths=Array(t.rows[0].length).fill(100/t.rows[0].length);col=at}
  if(action==='delCol'){if(cols<=1)return toast('Table must keep at least one column');t.rows.forEach(r=>r.splice(col,1));t.widths=Array(t.rows[0].length).fill(100/t.rows[0].length);col=Math.max(0,col-1)}
  if(action==='equalCols')t.widths=Array(cols).fill(100/cols);
  if(action==='setWidth'&&value>0&&value<100){const n=t.rows[0].length;const remain=100-value;const others=(n>1)?remain/(n-1):0;t.widths=Array.from({length:n},(_,i)=>i===col?value:others)}
  state.activeCell={row,col};markDirty(false);pushHistory(`Table ${action}`);renderBlocks();renderRegisters();
}

// ---------------- DOCX table import ----------------
const WORD_NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function showDocxImportDialog(){
  if(!state.current||state.current.templateId!=='scientific-draft-text')return toast('Open a text document first');
  state.docxImportSession={fileName:'',tables:[]};const body=byId('modalBody'),card=byId('modal').querySelector('.modal-card');card.classList.add('wizard-modal','docx-import-modal');
  body.innerHTML=`<div class="wizard-head"><div><span class="eyebrow">TABLE IMPORT</span><h3>Import tables from DOCX</h3><p>The file is read locally on this device and is never uploaded.</p></div><div class="wizard-steps"><span class="active">1 Choose file</span><span>2 Select tables</span><span>3 Table information</span></div></div><div class="docx-dropzone" id="docxDropzone" tabindex="0" role="button"><span class="docx-file-icon">W</span><b>Choose or drop a .docx file</b><small>Maximum 25 MB · tables become editable TERYAQ blocks</small><input id="docxFileInput" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden></div><div class="docx-status" id="docxStatus" role="status"></div><div class="wizard-footer"><span class="wizard-note">Merged or nested tables will be flagged for review.</span><button class="btn" id="cancelDocxImport">Cancel</button></div>`;
  const drop=byId('docxDropzone'),input=byId('docxFileInput');drop.onclick=()=>input.click();drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click()}};drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging')};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');if(e.dataTransfer.files[0])loadDocxFile(e.dataTransfer.files[0])};input.onchange=()=>input.files[0]&&loadDocxFile(input.files[0]);byId('cancelDocxImport').onclick=closeModal;byId('modal').classList.remove('hidden')
}
async function loadDocxFile(file){
  const status=byId('docxStatus');try{
    if(!/\.docx$/i.test(file.name))throw new Error('Choose a .docx file.');if(file.size>25*1024*1024)throw new Error('The DOCX file is larger than 25 MB.');if(typeof JSZip==='undefined')throw new Error('The offline DOCX reader is unavailable. Reload the updated app once while online.');
    status.textContent='Reading tables locally…';const tables=await parseDocxTables(file);if(!tables.length)throw new Error('No tables were found in this DOCX file.');state.docxImportSession={fileName:file.name,tables};renderDocxTableSelection()
  }catch(error){console.error(error);if(status)status.textContent=`Import could not start: ${error.message}`}
}
async function parseDocxTables(file){
  const zip=await JSZip.loadAsync(await file.arrayBuffer()),entry=zip.file('word/document.xml');if(!entry)throw new Error('The DOCX document body is missing.');const maxXmlBytes=15*1024*1024,reportedSize=Number(entry._data?.uncompressedSize||0);if(reportedSize>maxXmlBytes)throw new Error('The DOCX document body is too large to import safely.');const xmlText=await entry.async('string');if(xmlText.length>maxXmlBytes)throw new Error('The DOCX document body is too large to import safely.');const xml=new DOMParser().parseFromString(xmlText,'application/xml');if(xml.getElementsByTagName('parsererror').length)throw new Error('The DOCX document XML is invalid.');
  const all=[...xml.getElementsByTagNameNS(WORD_NS,'tbl')],top=all.filter(table=>!ancestorWithLocalName(table.parentNode,'tbl'));if(top.length>200)throw new Error('This DOCX contains more than 200 tables. Split it into smaller files first.');
  return top.map((table,index)=>parseWordTable(table,index));
}
function ancestorWithLocalName(node,name,stop=null){for(let current=node;current&&current!==stop;current=current.parentNode)if(current.localName===name)return current;return null}
function directWordChildren(node,name){return [...(node?.childNodes||[])].filter(child=>child.nodeType===1&&child.namespaceURI===WORD_NS&&child.localName===name)}
function wordAttribute(node,name){for(const attribute of [...(node?.attributes||[])])if(attribute.localName===name)return attribute.value;return ''}
function wordPropertyOn(node,name){const property=[...node.getElementsByTagNameNS(WORD_NS,name)][0];if(!property)return false;const value=wordAttribute(property,'val').toLowerCase();return !['0','false','off','none'].includes(value)}
function wordRunText(run){let text='';const visit=node=>{for(const child of [...(node.childNodes||[])]){if(child.nodeType!==1)continue;if(child.namespaceURI===WORD_NS&&child.localName==='t')text+=child.textContent||'';else if(child.namespaceURI===WORD_NS&&child.localName==='tab')text+='\t';else if(child.namespaceURI===WORD_NS&&(child.localName==='br'||child.localName==='cr'))text+='\n';else visit(child)}};visit(run);return text}
function parseWordParagraph(paragraph){const out=[];for(const run of [...paragraph.getElementsByTagNameNS(WORD_NS,'r')]){if(ancestorWithLocalName(run.parentNode,'p')!==paragraph)continue;const text=wordRunText(run);if(!text)continue;const properties=directWordChildren(run,'rPr')[0],marks=[];if(properties&&wordPropertyOn(properties,'b'))marks.push('bold');if(properties&&wordPropertyOn(properties,'i'))marks.push('italic');out.push({text,marks})}return normalizeRuns(out)}
function parseWordCell(cell){const paragraphs=[...cell.getElementsByTagNameNS(WORD_NS,'p')].filter(p=>ancestorWithLocalName(p.parentNode,'tc')===cell&&!ancestorWithLocalName(p.parentNode,'tbl',cell));const runs=[];paragraphs.forEach((paragraph,index)=>{if(index)runs.push({text:'\n',marks:[]});runs.push(...parseWordParagraph(paragraph))});return normalizeRuns(runs)}
function parseWordTable(table,index){
  const warnings=[];if(table.getElementsByTagNameNS(WORD_NS,'tbl').length)warnings.push('Nested table content was flattened.');let hasMerge=false,oversizedSpan=false;
  const rows=directWordChildren(table,'tr').map(row=>{const cells=[];for(const cell of directWordChildren(row,'tc')){const tcPr=directWordChildren(cell,'tcPr')[0],spanNode=tcPr?[...tcPr.getElementsByTagNameNS(WORD_NS,'gridSpan')][0]:null,rawSpan=Math.max(1,Number(wordAttribute(spanNode,'val'))||1),span=Math.min(51,rawSpan),vMerge=tcPr?[...tcPr.getElementsByTagNameNS(WORD_NS,'vMerge')][0]:null;if(rawSpan>50)oversizedSpan=true;if(span>1||vMerge)hasMerge=true;cells.push({runs:parseWordCell(cell)});for(let extra=1;extra<span;extra++)cells.push({runs:[]})}return cells});
  if(hasMerge)warnings.push('Merged cells are not supported and were converted to a flat grid.');const columns=Math.max(0,...rows.map(row=>row.length));rows.forEach(row=>{while(row.length<columns)row.push({runs:[]})});const cellCount=rows.length*columns,tooLarge=!rows.length||!columns||oversizedSpan||columns>50||cellCount>5000;if(!rows.length||!columns)warnings.push('This table has no usable cells.');else if(tooLarge)warnings.push('This table is too large to import safely (maximum 50 columns or 5,000 cells).');
  return {index,rows,columns,cellCount,warnings,selected:!tooLarge,disabled:tooLarge,headerRow:true,code:'',title:`Imported table ${index+1}`,caption:''}
}
function renderDocxTableSelection(){
  const session=state.docxImportSession,body=byId('modalBody');body.innerHTML=`<div class="wizard-head"><div><span class="eyebrow">${esc(session.fileName)}</span><h3>Select tables</h3><p>${session.tables.length} table${session.tables.length===1?'':'s'} detected. Preview and choose what to import.</p></div><div class="wizard-steps"><span>1 Choose file</span><span class="active">2 Select tables</span><span>3 Table information</span></div></div><div class="docx-table-list" id="docxTableList"></div><div class="wizard-footer"><button class="btn" id="chooseAnotherDocx">Choose another file</button><div><button class="btn" id="cancelDocxImport">Cancel</button> <button class="btn primary" id="docxMetadataNext">Next</button></div></div>`;
  const list=byId('docxTableList');session.tables.forEach(table=>{const item=document.createElement('label');item.className=`docx-table-choice${table.disabled?' disabled':''}`;const previewRows=table.rows.slice(0,4).map(row=>`<tr>${row.slice(0,5).map(cell=>`<td dir="auto">${esc(plainText(cell.runs)||' ')}</td>`).join('')}</tr>`).join('');item.innerHTML=`<div class="docx-choice-head"><input class="docx-table-select" type="checkbox" data-index="${table.index}" ${table.selected?'checked':''} ${table.disabled?'disabled':''}><span><b>Table ${table.index+1}</b><small>${table.rows.length} rows × ${table.columns} columns</small></span>${table.warnings.length?'<span class="docx-review-badge">Needs review</span>':'<span class="docx-ready-badge">Ready</span>'}</div><div class="docx-preview"><table><tbody>${previewRows}</tbody></table>${table.rows.length>4||table.columns>5?'<small>Preview truncated</small>':''}</div>${table.warnings.length?`<ul class="docx-warnings">${table.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`:''}`;list.appendChild(item)});
  byId('chooseAnotherDocx').onclick=showDocxImportDialog;byId('cancelDocxImport').onclick=closeModal;byId('docxMetadataNext').onclick=()=>{list.querySelectorAll('.docx-table-select').forEach(input=>{session.tables[Number(input.dataset.index)].selected=input.checked});if(!session.tables.some(table=>table.selected))return toast('Select at least one table');renderDocxMetadataStep()}
}
function renderDocxMetadataStep(){
  const session=state.docxImportSession,selected=session.tables.filter(table=>table.selected),existing=state.current.content.blocks.filter(block=>block.type==='table').length,body=byId('modalBody'),chapter=sanitizeChapterNumber(state.current.metadata?.chapterNumber||'');selected.forEach((table,index)=>{if(!table.code)table.code=chapter?`${chapter}.${existing+index+1}`:String(existing+index+1)});
  body.innerHTML=`<div class="wizard-head"><div><span class="eyebrow">TABLE INFORMATION</span><h3>Complete table details</h3><p>Code and title are required. Caption is optional.</p></div><div class="wizard-steps"><span>1 Choose file</span><span>2 Select tables</span><span class="active">3 Table information</span></div></div><div class="docx-metadata-list">${selected.map(table=>`<section class="docx-metadata-card" data-index="${table.index}"><div class="docx-metadata-title"><b>Table ${table.index+1}</b><span>${table.rows.length} × ${table.columns}</span></div><div class="docx-metadata-grid"><div class="field"><label>Table code *</label><input data-field="code" value="${esc(table.code)}" inputmode="decimal" pattern="[0-9.]*" title="Numbers and dots only" required></div><div class="field"><label>Table title *</label><input data-field="title" value="${esc(table.title)}" required></div><div class="field span-2"><label>Table caption (optional)</label><input data-field="caption" value="${esc(table.caption)}"></div></div><label class="docx-header-toggle"><input data-field="headerRow" type="checkbox" ${table.headerRow?'checked':''}> Use the first row as a header row</label>${table.warnings.length?`<div class="docx-inline-warning"><b>Needs review:</b> ${esc(table.warnings.join(' '))}</div>`:''}</section>`).join('')}</div><div class="wizard-footer"><button class="btn" id="backToDocxTables">Back</button><div><button class="btn" id="cancelDocxImport">Cancel</button> <button class="btn primary" id="insertDocxTables">Insert ${selected.length} table${selected.length===1?'':'s'}</button></div></div>`;
  body.querySelectorAll('[data-field="code"]').forEach(input=>input.addEventListener('input',()=>{input.value=sanitizeNumericCode(input.value)}));byId('backToDocxTables').onclick=renderDocxTableSelection;byId('cancelDocxImport').onclick=closeModal;byId('insertDocxTables').onclick=()=>insertSelectedDocxTables()
}
function insertSelectedDocxTables(){
  const session=state.docxImportSession,selected=session.tables.filter(table=>table.selected);for(const card of byId('modalBody').querySelectorAll('.docx-metadata-card')){const table=session.tables[Number(card.dataset.index)];card.querySelectorAll('[data-field]').forEach(input=>{table[input.dataset.field]=input.type==='checkbox'?input.checked:(input.dataset.field==='code'?sanitizeNumericCode(input.value):input.value.trim())});if(!table.code||!table.title){card.querySelector('[data-field="'+(!table.code?'code':'title')+'"]').focus();return toast('A numeric Table code and Table title are required')}}
  const blocks=state.current.content.blocks;let at=blocks.findIndex(block=>block.id===state.activeBlockId);if(at<0)at=blocks.length-1;const imported=selected.map(table=>({id:uid('tbl'),type:'table',code:table.code,title:table.title,caption:table.caption,headerRow:table.headerRow,widths:Array(table.columns).fill(100/table.columns),rows:clone(table.rows),importedFrom:{format:'docx',fileName:session.fileName,tableIndex:table.index+1,importedAt:nowIso(),warnings:clone(table.warnings)}}));blocks.splice(at+1,0,...imported);const after=blocks[at+1+imported.length];if(!after||!['paragraph','bullet','number'].includes(after.type))blocks.splice(at+1+imported.length,0,normalBlock());markDirty(false);pushHistory(`Import ${imported.length} DOCX table${imported.length===1?'':'s'}`);closeModal();renderBlocks();renderOutline();renderRegisters();setActiveBlock(imported[0].id);toast(`${imported.length} DOCX table${imported.length===1?'':'s'} imported`)
}

// ---------------- Outline/register ----------------
function headingStructure(){const out=[];let current=null;let h1n=0,h2n=0;for(const b of state.current.content.blocks){if(b.type==='paragraph'&&b.style==='Heading1'){h1n++;h2n=0;current={id:b.id,n:h1n,title:plainText(b.runs).trim(),h2:[]};out.push(current)}else if(b.type==='paragraph'&&b.style==='Heading2'&&current){h2n++;current.h2.push({id:b.id,n:h2n,title:plainText(b.runs).trim()})}}return out}
function renderOutline(){const host=byId('outlineList');if(!host)return;const hs=headingStructure();host.innerHTML='';if(!hs.length){host.innerHTML='<div class="outline-empty">No Heading 1 sections yet.</div>';return;}for(const h of hs){const d=document.createElement('details');d.className='outline-group';d.open=true;const s=document.createElement('summary');s.innerHTML=`<span>${h.n}</span><span>${esc(h.title||'(Untitled heading)')}</span>`;s.onclick=e=>{if(e.target.closest('summary'))setTimeout(()=>scrollToBlock(h.id),0)};d.appendChild(s);if(h.h2.length){const list=document.createElement('div');list.className='outline-h2s';h.h2.forEach(x=>{const b=document.createElement('button');b.className='outline-link';b.innerHTML=`<strong>${x.n}</strong>&nbsp;&nbsp;${esc(x.title||'(Untitled)')}`;b.onclick=()=>scrollToBlock(x.id);list.appendChild(b)});d.appendChild(list)}host.appendChild(d)}}
function scrollToBlock(id){const el=state.viewOnly?document.querySelector(`[data-source-block-id="${CSS.escape(id)}"]`):document.querySelector(`[data-block-id="${CSS.escape(id)}"]`);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});if(innerWidth<=820)setOutlineDrawerOpen(false)}
function renderRegisters(){
  const h=headingStructure(),hr=byId('headingRegister');if(hr){hr.innerHTML='<div class="heading-register-head">Headings 1</div>';const count=Math.max(12,h.length);for(let i=0;i<count;i++){const row=document.createElement('div');row.className='heading-register-row';row.innerHTML=`<span class="n">${i+1}</span><span>${esc(h[i]?.title||'')}</span>`;hr.appendChild(row)}}
  const tables=state.current.content.blocks.filter(b=>b.type==='table'&&[b.code,b.title,b.caption].some(value=>String(value||'').trim())),tr=byId('tableRegister');if(!tr)return;tr.innerHTML='<div class="table-register-header"><span>Table code</span><span>Table title</span><span>Table caption (optional)</span></div>';
  if(!tables.length){tr.insertAdjacentHTML('beforeend','<div class="table-register-empty">Insert a table to add its information here automatically.</div>');return}
  tables.forEach((table,index)=>{const row=document.createElement('div');row.className='table-register-row';row.dataset.tableId=table.id;row.innerHTML=`<div class="field"><label class="sr-only" for="table-code-${index}">Table code</label><input id="table-code-${index}" data-table-field="code" value="${esc(table.code||'')}" placeholder="e.g., 3.1" inputmode="decimal" pattern="[0-9.]*" title="Numbers and dots only"></div><div class="field"><label class="sr-only" for="table-title-${index}">Table title</label><input id="table-title-${index}" data-table-field="title" value="${esc(table.title||'')}" placeholder="Table title"></div><div class="field"><label class="sr-only" for="table-caption-${index}">Table caption</label><input id="table-caption-${index}" data-table-field="caption" value="${esc(table.caption||'')}" placeholder="Optional caption"></div>`;row.querySelectorAll('[data-table-field]').forEach(input=>input.addEventListener('input',()=>{if(input.dataset.tableField==='code')input.value=sanitizeNumericCode(input.value);table[input.dataset.tableField]=input.value;refreshRenderedTableCaption(table);markDirty()}));tr.appendChild(row)
  })
}

// ---------------- Validation ----------------
function validateCurrent(){const d=state.current,issues=[];const err=m=>issues.push({level:'error',message:m}),warn=m=>issues.push({level:'warn',message:m});if(!d)return issues;
  if(d.templateId==='scientific-draft-text'){
    const m=d.metadata||{};if(!String(m.name||'').trim())warn('Name is empty.');if(!String(m.course||m.subject||'').trim())warn('Course is empty.');for(const [k,l] of [['chapterNumber','Chapter number'],['chapterTitle','Chapter title']])if(!String(m[k]||'').trim())warn(`${l} is empty.`);
    let seenH1=false;const figCodes=new Map(),tableCodes=new Map();
    for(const b of d.content.blocks){if(b.type==='paragraph'&&b.style==='Heading1'){seenH1=true;if(!plainText(b.runs).trim())err('An empty Heading 1 exists.')}if(b.type==='paragraph'&&b.style==='Heading2'&&!seenH1)err(`Heading 2 “${plainText(b.runs).trim()||'(empty)'}” appears before any Heading 1.`);if(b.type==='figure_placeholder'){if(!String(b.code||'').trim())err('A figure placeholder has no code.');else{if(!/^[0-9.]+$/.test(b.code))err(`Figure code ${b.code} must contain numbers and dots only.`);figCodes.set(b.code,(figCodes.get(b.code)||0)+1)}}if(b.type==='table'&&b.code){if(!/^[0-9.]+$/.test(b.code))err(`Table code ${b.code} must contain numbers and dots only.`);tableCodes.set(b.code,(tableCodes.get(b.code)||0)+1)}if(['paragraph','bullet','number'].includes(b.type)&&(b.runs||[]).some(r=>(r.marks||[]).includes('NotesToDelete')))warn('A “Note to Delete” remains in the document.');if(b.type==='table'){const lens=b.rows.map(r=>r.length);if(new Set(lens).size>1)err(`Table ${b.code||'(uncoded)'} has inconsistent row lengths.`)}}
    for(const [c,n] of figCodes)if(n>1)err(`Figure code ${c} is duplicated ${n} times.`);for(const [c,n] of tableCodes)if(n>1)err(`Table code ${c} is duplicated ${n} times.`);if(!seenH1)warn('No Heading 1 exists yet.');
  } else {
    const codes=new Map();for(const f of d.content.figures||[]){if(!f.code)err('A figure has no code.');else if(!/^[0-9.]+$/.test(f.code))err(`Figure code ${f.code} must contain numbers and dots only.`);if(!f.title)err(`Figure ${f.code||'?'} has no title.`);if(!f.source)err(`Figure ${f.code||'?'} has no source.`);if(!f.order)err(`Figure ${f.code||'?'} has no order.`);if(!f.copyright)err(`Figure ${f.code||'?'} has no copyright status.`);if(f.code)codes.set(f.code,(codes.get(f.code)||0)+1)}for(const [c,n] of codes)if(n>1)err(`Figure code ${c} is duplicated ${n} times.`)
  }
  return issues;
}
function ensureFigureExportReady(){
  if(state.current?.templateId!=='scientific-draft-figures')return true;let first=null,missing=false;
  for(const [index,figure] of (state.current.content.figures||[]).entries())for(const key of ['code','title','source','order','copyright'])if(!String(figure[key]||'').trim()){missing=true;const input=byId(`fig-card-${index+1}`)?.querySelector(`[data-k="${key}"]`);input?.classList.add('invalid-required');if(!first&&input)first=input}
  if(!missing)return true;if(first){first.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>first.focus(),350)}showValidation();alert('Export is blocked until every figure has Figure code, Figure title, Source, Order, and Copyright status. Missing fields are highlighted in red.');return false
}
function showValidation(){const issues=validateCurrent(),host=byId('issues');host.innerHTML='';if(!issues.length)host.innerHTML='<div class="issue">✓ No structural issues found.</div>';else issues.forEach(i=>{const d=document.createElement('div');d.className=`issue ${i.level}`;d.textContent=(i.level==='error'?'ERROR: ':'WARNING: ')+i.message;host.appendChild(d)});byId('validationPanel').classList.remove('hidden')}

// ---------------- Export/import/backups ----------------
function exportDocumentPackage(doc){const pkg={format:'TeryaqPackage',packageVersion:'1.0.0',exportedAt:nowIso(),appVersion:APP_VERSION,document:clone(doc)};downloadBlob(new Blob([JSON.stringify(pkg,null,2)],{type:'application/json'}),`${fileSafe(doc.title)}.teryaq`)}
function downloadBlob(blob,name){if(!blob.size)return alert('Export failed: file is empty.');const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},30000)}
async function importPackage(file){try{const txt=await file.text();const pkg=JSON.parse(txt);let doc=pkg.document||pkg;if(!doc.templateId||!doc.content)throw new Error('Not a Teryaq document');await snapshotIfConflict(doc);const sourceOwner=doc.ownerId,currentOwner=TeryaqPlatform.user()?.id;if((sourceOwner&&sourceOwner!==currentOwner)||await idbGet('documents',doc.id)){doc=clone(doc);doc.id=uid('doc');doc.title=(doc.title||'Imported')+' Imported';}if(String(doc.schemaVersion||'1.0.0')>SCHEMA_VERSION)throw new Error('This document was created with a newer document schema. Update TERYAQ Master Tool before editing it.');doc=TeryaqPlatform.decorateImportedDocument(doc);doc.updatedAt=nowIso();await idbPut('documents',doc);await TeryaqPlatform.queueDocument(doc);await refreshLibrary();renderHome();toast('Imported successfully')}catch(e){alert('Import failed: '+e.message)}finally{byId('importFile').value=''}}
async function snapshotIfConflict(doc){const old=await idbGet('documents',doc.id);if(old)await snapshotDocument(old,'Before import conflict')}
async function saveAsTemplate(){const name=prompt('Template name:',(state.current.title||'Document')+' Template');if(!name)return;const informationTitle=prompt('Information step title:','Draft information')||'Draft information';const base=clone(state.current);base.id='TEMPLATE_BASE';base.createdAt=base.updatedAt='';if(base.metadata){for(const k of Object.keys(base.metadata))base.metadata[k]=Array.isArray(base.metadata[k])?[]:''}const t={id:uid('tpl'),ownerId:TeryaqPlatform.user()?.id,custom:true,name,version:'1.0.0',category:'Custom',informationTitle,description:'Custom reusable template saved locally.',editor:getTemplate(state.current.templateId)?.editor||'rich-document',baseDocument:base,createdAt:nowIso()};await idbPut('templates',t);await refreshLibrary();toast('Saved as reusable template')}
async function blobDataUrl(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob)})}
async function embeddedTajawalCss(){try{const files=[['Regular',400],['Medium',500],['Bold',700]],fonts=await Promise.all(files.map(async([name,weight])=>{const response=await fetch(`fonts/Tajawal-${name}.ttf`);if(!response.ok)throw new Error(`Font ${name} unavailable`);return `@font-face{font-family:'Tajawal';src:url('${await blobDataUrl(await response.blob())}') format('truetype');font-style:normal;font-weight:${weight};font-display:swap}`}));return fonts.join('')}catch(error){console.warn('HTML export font embedding unavailable:',error);return ''}}
async function exportStandaloneHtml(){
  if(!state.current)return;const documentCopy=clone(state.current),fontCss=await embeddedTajawalCss(),screenCss=`${fontCss}@media screen{body{background:#eef1f4;padding:24px}.cover,body>main,body>section:not(.cover){display:block;width:min(210mm,100%);min-height:297mm;margin:0 auto 20px;padding:21mm 16mm 18mm;background:#fff;box-shadow:0 10px 35px rgba(17,28,45,.12)}.cover{page-break-after:auto}body>main{min-height:297mm}}@media(max-width:760px){body{padding:0}.cover,body>main,body>section:not(.cover){width:100%;min-height:0;margin:0;padding:18px;box-shadow:none}}@media print{body{background:#fff;padding:0}.cover,body>main,body>section:not(.cover){width:auto;min-height:0;margin:0;padding:0;box-shadow:none}}`,base=documentCopy.templateId==='scientific-draft-text'?buildTextPrintHtml(documentCopy):buildFigurePrintHtml(documentCopy),html=base.replace('</style>',`${screenCss}</style>`).replace('<meta charset="utf-8">','<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">');downloadBlob(new Blob([html],{type:'text/html;charset=utf-8'}),`${fileSafe(documentCopy.title)}.html`);toast('Standalone HTML exported')
}

// ---------------- Version history ----------------
async function showSnapshots(){if(!state.current)return;const snaps=(await idbByIndex('snapshots','documentId',state.current.id)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,50),body=byId('modalBody');body.innerHTML='<h3>History / Recovery Versions</h3><div class="history-explainer"><b>Local recovery snapshots</b><br>Restore one if you need an earlier state on this device. Cloud versions are immutable snapshots created after successful synchronization and can be compared or downloaded when online.</div><div class="modal-actions"><button class="btn primary" id="createSnapshotNow">Create local snapshot</button><button class="btn" id="openCloudVersions">Cloud versions & compare</button></div>';if(!snaps.length)body.innerHTML+='<p>No local recovery snapshots yet. Create one now, or keep editing and the app will create recovery points automatically.</p>';snaps.forEach(s=>{const r=document.createElement('div');r.className='snapshot-row';r.innerHTML=`<div><strong>${esc(fmtDate(s.createdAt))}</strong><br><small>${esc(s.reason||'Snapshot')}</small></div><button class="btn small">Restore</button>`;r.querySelector('button').onclick=async()=>{if(confirm('Restore this snapshot? Current state will first be saved as a snapshot.')){await createSnapshot('Before restore');state.current=clone(s.document);await saveCurrent(false);resetHistory();renderEditor();pushHistory('Restored');byId('modal').classList.add('hidden');toast('Snapshot restored')}};body.appendChild(r)});byId('createSnapshotNow').onclick=async()=>{await createSnapshot('Manual snapshot');showSnapshots()};byId('openCloudVersions').onclick=()=>TeryaqPlatform.showCloudVersions(state.current.id);byId('modal').classList.remove('hidden')}

// ---------------- Print renderer ----------------
function printCurrent(){const issues=validateCurrent();if(issues.some(i=>i.level==='error')&&!confirm('Validation has errors. Print anyway?'))return;const html=state.current.templateId==='scientific-draft-text'?buildTextPrintHtml(state.current):buildFigurePrintHtml(state.current);const w=window.open('','_blank');if(!w)return alert('Please allow popups for printing.');w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{w.focus();w.print()},450)}
function basePrintCss(){return `@page{size:A4;margin:21mm 16mm 18mm}*{box-sizing:border-box}body{margin:0;font-family:Tajawal,Arial,sans-serif;color:#000;font-size:11pt;line-height:1.30}.cover{page-break-after:always}.meta{width:100%;border-collapse:collapse}.meta td{border:1px solid #000;padding:6px}.meta td:first-child{width:28%;font-weight:bold}.reg{width:100%;border-collapse:collapse;margin-top:14px}.reg td,.reg th{border:1px solid #000;padding:5px}.h1{font-size:14pt;font-weight:bold;color:#C45911;margin:12pt 0 0}.h2{font-size:13pt;font-weight:bold;color:#538135;margin:2pt 0 0}.h3{font-size:12pt;font-weight:bold;color:#2E74B5;margin:2pt 0 0}.h4{font-size:11pt;font-style:italic;color:#2F5496}.subtitle{color:#7F7F7F}.caption{font-size:9pt;font-style:italic;color:#767171}.fig{background:#FFED29;color:#176A98;text-align:center;font-weight:bold;padding:7px 10px;margin:8pt 0 10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-inside:avoid}.bullet{display:grid;grid-template-columns:18px minmax(0,1fr);gap:5px;text-align:start}.l1{margin-inline-start:26pt}.l2{margin-inline-start:44pt}.l3{margin-inline-start:62pt}.num{display:grid;grid-template-columns:25px minmax(0,1fr);gap:5px;margin-inline-start:20pt;text-align:start}table.data{width:100%;border-collapse:collapse;table-layout:fixed;margin:3pt 0}table.data td,table.data th{border:1px solid #000;padding:5pt 6pt;vertical-align:top;overflow-wrap:anywhere}table.data thead{display:table-header-group}table.data tr{break-inside:avoid}.SideNote{color:#BF8F00}.NotesToDelete{color:#FF0000;font-weight:bold;font-size:9pt}.HighYield{color:#7030A0;font-weight:bold;text-decoration:underline}.ClinicalCorrelation{color:#39E794}h1,h2,h3,h4{break-after:avoid}.h1,.h2,.h3{font-style:normal}.h4{font-weight:400}.subtitle{font-weight:400;font-style:normal}.caption{font-weight:400}.SideNote{font-size:11pt;font-weight:400;font-style:normal}.NotesToDelete{font-style:normal}.HighYield{font-size:11pt;font-style:normal}.ClinicalCorrelation{font-size:11pt;font-weight:400;font-style:normal}`}
function runsPrintHtml(runs){return normalizeRuns(runs).map(r=>{let h=esc(r.text).replace(/\n/g,'<br>');const m=r.marks||[];if(m.includes('bold'))h=`<strong>${h}</strong>`;if(m.includes('italic'))h=`<em>${h}</em>`;for(const x of ['SideNote','NotesToDelete','HighYield','ClinicalCorrelation'])if(m.includes(x))h=`<span class="${x}">${h}</span>`;const fs=m.find(x=>x.startsWith('font:'));if(fs)h=`<span style="font-size:${esc(fs.split(':')[1])}pt">${h}</span>`;return h}).join('')}
function buildTextPrintHtml(d){let h1=0,h2=0,num=0;const headings=[],tables=[];let body='';for(const b of d.content.blocks){const direction=textDirection(plainText(b.runs||[]));if(b.type==='paragraph'){let cls='';let prefix='';if(b.style==='Heading1'){h1++;h2=0;cls='h1';prefix=h1+'. ';headings.push({n:h1,title:plainText(b.runs)})}else if(b.style==='Heading2'){h2++;cls='h2';prefix=h2+'. '}else if(b.style==='Heading3')cls='h3';else if(b.style==='Heading4')cls='h4';else if(b.style==='Subtitle')cls='subtitle';else if(b.style==='TableCaption')cls='caption';body+=`<div class="${cls}" dir="${direction}">${prefix}${runsPrintHtml(b.runs)}</div>`;num=0}else if(b.type==='bullet'){body+=`<div class="bullet l${b.level}" dir="${direction}"><span>${STYLE_CONTRACT.BulletLevels[b.level].marker}</span><div>${runsPrintHtml(b.runs)}</div></div>`;num=0}else if(b.type==='number'){num++;body+=`<div class="num" dir="${direction}"><span>${num}.</span><div>${runsPrintHtml(b.runs)}</div></div>`}else if(b.type==='figure_placeholder'){body+=`<div class="fig">[POSITION OF ${b.placement==='margin'?'MARGIN ':''}FIGURE ${esc(b.code)}]</div>`;num=0}else if(b.type==='table'){tables.push(b);body+=tablePrintHtml(b);num=0}}
  const m=d.metadata||{};const metaRows=[['Name',m.name],['Start date',m.startDate],['End date',m.endDate],['Course',m.course||m.subject],['Chapter number',m.chapterNumber],['Chapter title',m.chapterTitle]].map(x=>`<tr><td>${esc(x[0])}</td><td>${esc(x[1]||'')}</td></tr>`).join('');const reg=Array.from({length:Math.max(12,headings.length)},(_,i)=>`<tr><td style="width:9%"><b>${i+1}</b></td><td>${esc(headings[i]?.title||'')}</td></tr>`).join('');const treg=`<tr><th>Table code</th><th>Table title</th><th>Table caption</th></tr>${tables.map(t=>`<tr><td><b>${esc(t.code||'')}</b></td><td>${esc(t.title||'')}</td><td>${esc(t.caption||'')}</td></tr>`).join('')}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${basePrintCss()}</style></head><body><section class="cover"><table class="meta">${metaRows}</table><table class="reg"><tr><th colspan="2" style="text-align:left">Headings 1</th></tr>${reg}</table><table class="reg">${treg}</table></section><main>${body}</main></body></html>`}
function tablePrintHtml(b){const rows=b.rows.map((r,ri)=>{const tag=b.headerRow!==false&&ri===0?'th':'td';return `<tr>${r.map((c,ci)=>`<${tag} style="width:${b.widths?.[ci]||''}%">${runsPrintHtml(c.runs)}</${tag}>`).join('')}</tr>`}).join(''),caption=tableCaptionText(b);return `<table class="data"><tbody>${rows}</tbody></table>${caption?`<div class="caption">${esc(caption)}</div>`:''}`}
function buildFigurePrintHtml(d){const m=d.metadata||{};const cards=(d.content.figures||[]).map(f=>`<section style="break-after:page;margin-bottom:15mm"><table class="meta"><tr><td>Figure code</td><td>${esc(f.code)}</td></tr><tr><td>Figure title</td><td>${esc(f.title)}</td></tr><tr><td>Caption</td><td>${esc(f.caption)}</td></tr><tr><td>Source</td><td>${esc(f.source)}</td></tr><tr><td>Order</td><td>${esc(f.order)}</td></tr><tr><td>Details</td><td>${esc(f.details)}</td></tr><tr><td>Copyright status</td><td>${esc(f.copyright)}</td></tr><tr><td>Notes</td><td>${esc(f.notes)}</td></tr></table>${f.image?`<div style="text-align:center;margin-top:10mm"><img src="${f.image}" style="max-width:100%;max-height:120mm"></div>`:''}</section>`).join('');return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${basePrintCss()} img{object-fit:contain}</style></head><body><section class="cover"><table class="meta"><tr><td>Name</td><td>${esc(m.name)}</td></tr><tr><td>Course</td><td>${esc(m.course||m.subject)}</td></tr><tr><td>Chapter number</td><td>${esc(m.chapterNumber)}</td></tr><tr><td>Chapter title</td><td>${esc(m.chapterTitle)}</td></tr><tr><td>General notes</td><td>${esc(m.generalNotes)}</td></tr></table></section>${cards}</body></html>`}

// ---------------- Figure editor ----------------
const FIG_ORDERS=['Order 1 - KEEP as it is','Order 2 - DO the following changes','Order 3 - RECREATE with Ai','Order 4 - DESIGN by Teryaq','Order 5 - SEARCH for a Figure'];
function renderFigureEditor(){const d=state.current,m=d.metadata;byId('addFigureBtn').onclick=()=>{d.content.figures.push(blankFigure());markDirty(false);pushHistory('Add figure');renderFigureCards();renderFigureNav();setTimeout(()=>byId(`fig-card-${d.content.figures.length}`)?.scrollIntoView({behavior:'smooth',block:'start'}),0)};const updateTitle=()=>{d.title=[m.course||m.subject,m.chapterNumber?`CH ${m.chapterNumber}`:'',m.chapterTitle,'Figures'].filter(Boolean).join(' — ')||'Untitled Figures Draft';byId('docTitle').textContent=d.title;markDirty()};bindMetadataCatalogFields({author:'figMetaName',course:'figMetaCourse',chapter:'figMetaChapter'},m,updateTitle);const notes=byId('figMetaNotes');notes.value=m.generalNotes||'';notes.oninput=()=>{m.generalNotes=notes.value;markDirty()};renderFigureCards();renderFigureNav();renderFigureUploadSummary();}
function renderFigureCards(){const host=byId('figureCards');host.innerHTML='';state.current.content.figures.forEach((f,i)=>host.appendChild(renderFigureCard(f,i)))}
function renderFigureCard(f,i){const sec=document.createElement('section');sec.className='figure-card';sec.id=`fig-card-${i+1}`;sec.innerHTML=`<div class="figure-card-head"><div><strong>Figure ${i+1}</strong> <span class="chip">${esc(f.code||'No code')}</span></div><div class="card-actions"><button class="btn small duplicate">Duplicate</button><button class="btn danger small delete">Delete</button></div></div><div class="figure-card-body"><div class="figure-grid">
<div class="field"><label>Figure code *</label><input data-k="code" value="${esc(f.code)}" placeholder="e.g., 3.1" inputmode="decimal" pattern="[0-9.]*" title="Numbers and dots only"></div><div class="field"><label>Figure title *</label><input data-k="title" value="${esc(f.title)}"></div><div class="field span-2"><label>Caption</label><textarea data-k="caption">${esc(f.caption)}</textarea></div><div class="field span-2"><label>Source *</label><input data-k="source" value="${esc(f.source)}" placeholder="URL, book + page, or Teryaq"></div><div class="field"><label>Order *</label><select data-k="order"><option value="">Select order…</option>${FIG_ORDERS.map(o=>`<option ${o===f.order?'selected':''}>${esc(o)}</option>`).join('')}</select></div><div class="field"><label>Copyright status *</label><select data-k="copyright"><option value="">Select status…</option>${['There is copyright issues','There is no copyright issues',"I don't know"].map(o=>`<option ${o===f.copyright?'selected':''}>${esc(o)}</option>`).join('')}</select></div><div class="field span-2"><label>PROMPT — Details</label><textarea data-k="details">${esc(f.details)}</textarea></div><div class="field span-2"><label>Notes</label><textarea data-k="notes">${esc(f.notes)}</textarea></div><div class="field span-2"><label>Figure / reference image</label><div class="dropzone"><div class="drop-content">${f.image?`<img src="${f.image}">`:'Click or drop image here'}</div><input type="file" accept="image/*" hidden></div><div class="figure-upload-progress ${esc(f.imageStatus||'empty')}" data-upload-figure="${esc(f.id)}"><div><span>${esc(figureUploadStatusLabel(f))}</span><b>${esc(figureUploadDetail(f))}</b></div><progress max="100" value="${figureUploadPercent(f)}"></progress></div><div class="card-actions"><button class="btn small clear-image">Clear image</button></div></div></div></div>`;
  sec.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('input',()=>{el.classList.remove('invalid-required');if(el.dataset.k==='code')el.value=sanitizeNumericCode(el.value);f[el.dataset.k]=el.value;markDirty();renderFigureNav()}));sec.querySelector('.duplicate').onclick=()=>{const c=clone(f);c.id=uid('fig');c.attachmentId='';c.storagePath='';c.imageStatus=c.image?'saved-local':'';state.current.content.figures.splice(i+1,0,c);markDirty(false);pushHistory('Duplicate figure');renderFigureCards();renderFigureNav()};sec.querySelector('.delete').onclick=()=>{if(confirm('Delete this figure?')){state.current.content.figures.splice(i,1);if(!state.current.content.figures.length)state.current.content.figures.push(blankFigure());markDirty(false);pushHistory('Delete figure');renderFigureCards();renderFigureNav()}};
  const dz=sec.querySelector('.dropzone'),inp=dz.querySelector('input');dz.onclick=()=>inp.click();dz.ondragover=e=>e.preventDefault();dz.ondrop=e=>{e.preventDefault();if(e.dataTransfer.files[0])loadFigImage(e.dataTransfer.files[0],f)};inp.onchange=()=>inp.files[0]&&loadFigImage(inp.files[0],f);sec.querySelector('.clear-image').onclick=async()=>{if(f.attachmentId)await idbDelete('mediaQueue',f.attachmentId).catch(()=>{});Object.assign(f,{image:'',attachmentId:'',storagePath:'',imageStatus:'',imageName:'',imageSize:0,uploadedBytes:0});markDirty();renderFigureCards()};if(!f.image&&f.storagePath)void loadRemoteFigurePreview(f,sec);return sec;
}
function formatBytes(value){const bytes=Number(value||0);if(bytes<1024)return `${bytes} B`;if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;return `${(bytes/1024/1024).toFixed(1)} MB`}
function figureUploadPercent(f){return f.imageSize?Math.min(100,Math.round(Number(f.uploadedBytes||0)/Number(f.imageSize)*100)):0}
function figureUploadStatusLabel(f){return ({'saved-local':'Saved locally · waiting for sync','waiting':'Waiting to upload','uploading':'Uploading','paused-offline':'Paused · offline','uploaded':'Uploaded & synced','failed':'Upload failed · will retry'})[f.imageStatus]||(f.image?'Saved locally':'No image selected')}
function figureUploadDetail(f){if(!f.image)return '';const parts=[`${figureUploadPercent(f)}%`,`${formatBytes(f.uploadedBytes)} / ${formatBytes(f.imageSize)}`];if(f.uploadSpeed)parts.push(`${formatBytes(f.uploadSpeed)}/s`);if(Number.isFinite(f.uploadEta)&&f.uploadEta>0)parts.push(`~${Math.ceil(f.uploadEta)}s left`);return parts.join(' · ')}
function renderFigureUploadSummary(){const host=byId('figureUploadSummary');if(!host||state.current?.templateId!=='scientific-draft-figures')return;const figures=(state.current.content.figures||[]).filter(figure=>figure.image),total=figures.reduce((sum,figure)=>sum+Number(figure.imageSize||0),0),uploaded=figures.reduce((sum,figure)=>sum+Math.min(Number(figure.uploadedBytes||0),Number(figure.imageSize||0)),0),pending=figures.filter(figure=>figure.imageStatus!=='uploaded').length;if(!figures.length){host.classList.add('hidden');return}host.classList.remove('hidden');host.innerHTML=`<div><b>Image uploads</b><span>${pending?`${pending} waiting or uploading`:'All images uploaded & synced'}</span></div><strong>${total?Math.round(uploaded/total*100):0}% · ${formatBytes(uploaded)} / ${formatBytes(total)}</strong><progress max="100" value="${total?uploaded/total*100:0}"></progress>`}
function updateFigureUploadProgressDom(record){const host=document.querySelector(`[data-upload-figure="${CSS.escape(record.figureId)}"]`);if(!host)return;host.className=`figure-upload-progress ${record.status||''}`;const figure=state.current?.content?.figures?.find(item=>item.id===record.figureId)||record;host.querySelector('span').textContent=figureUploadStatusLabel(figure);host.querySelector('b').textContent=figureUploadDetail(figure);host.querySelector('progress').value=figureUploadPercent(figure)}
async function loadFigImage(file,f){if(!file.type.startsWith('image/'))return alert('Choose an image file.');if(file.size>60*1024*1024)return alert('This image is larger than 60 MB. Compress it before adding it.');const attachmentId=uid('att'),dataUrl=await blobDataUrl(file);f.image=dataUrl;Object.assign(f,{attachmentId,storagePath:'',imageStatus:navigator.onLine?'waiting':'paused-offline',imageName:file.name,imageSize:file.size,uploadedBytes:0,uploadSpeed:0,uploadEta:0});await idbPut('mediaQueue',{id:attachmentId,ownerId:TeryaqPlatform.user()?.id,documentId:state.current.id,figureId:f.id,file,fileName:file.name,contentType:file.type,size:file.size,status:f.imageStatus,uploadedBytes:0,tusUrl:'',storagePath:'',queuedAt:nowIso(),updatedAt:nowIso()});markDirty(false);pushHistory('Add figure image');renderFigureCards();TeryaqPlatform.scheduleAutoSync(0)}
async function loadRemoteFigurePreview(f,card){const content=card.querySelector('.drop-content');content.textContent=navigator.onLine?'Loading image…':'Image available after connecting';try{const source=await TeryaqPlatform.getAttachmentPreview(f.storagePath);if(source&&card.isConnected){f.image=source;content.innerHTML=`<img src="${source}" alt="">`}}catch(error){if(card.isConnected)content.textContent='Image could not be loaded · Retry when online'}}
function renderFigureNav(){const host=byId('figureNavButtons');host.innerHTML='';state.current.content.figures.forEach((f,i)=>{const b=document.createElement('button');b.textContent=i+1;b.title=f.title||`Figure ${i+1}`;b.onclick=()=>byId(`fig-card-${i+1}`).scrollIntoView({behavior:'smooth',block:'start'});host.appendChild(b)})}

// ---------------- Responsive page scale ----------------
function observeWritingPage(){const page=byId('writingPage');if(!page||typeof ResizeObserver==='undefined')return;if(!state.pageResizeObserver)state.pageResizeObserver=new ResizeObserver(()=>requestAnimationFrame(updatePageScale));state.pageResizeObserver.disconnect();state.pageResizeObserver.observe(page)}
function updatePageScale(){
  const main=document.querySelector('#textEditorArea .editor-main'),column=byId('editorContentColumn'),scaleHost=document.querySelector('#textEditorArea .page-scale-host'),wrap=byId('pageWrap'),page=byId('writingPage');if(!main||!column||!scaleHost||!wrap||!page)return;
  const zoom=Number(state.viewZoom||1);if(innerWidth<=820){page.style.removeProperty('--page-scale');column.style.width='100%';scaleHost.style.width='100%';scaleHost.style.height='auto';wrap.style.width='100%';wrap.style.height='auto';const label=byId('zoomResetBtn');if(label)label.textContent='Fit';return}
  const rawWidth=page.offsetWidth||794,rawHeight=Math.max(page.scrollHeight,page.offsetHeight),available=Math.max(320,main.clientWidth-28),fit=Math.max(.55,Math.min(1.45,(available-2)/rawWidth)),scale=Math.max(.45,Math.min(1.75,fit*zoom)),displayWidth=Math.round(rawWidth*scale),displayHeight=Math.ceil(rawHeight*scale);
  page.style.setProperty('--page-scale',scale.toFixed(3));column.style.width=`${displayWidth}px`;scaleHost.style.width=`${displayWidth}px`;scaleHost.style.height=`${displayHeight}px`;wrap.style.width=`${displayWidth}px`;wrap.style.height=`${displayHeight}px`;
  const label=byId('zoomResetBtn');if(label)label.textContent=`${Math.round(zoom*100)}%`;
}

// ---------------- Mobile fixed controls behavior ----------------
function wireMobile(){/* CSS-driven; buttons bound in bindTextControls */}

// ---------------- Init ----------------
document.addEventListener('DOMContentLoaded',()=>boot().catch(e=>{console.error(e);alert('TERYAQ Master Tool failed to start: '+e.message)}));

})();
