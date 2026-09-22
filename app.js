/* Teryaq Author Offline App v1.0
   Local-first, dependency-free PWA prototype.
   Document data is structured JSON; the DOM is only the editor surface. */
(() => {
'use strict';

const APP_VERSION = '2.1.0';
const SCHEMA_VERSION = '2.0.0';
const DB_NAME = 'TeryaqAuthorDB';
const DB_VERSION = 2;
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_HISTORY = 120;

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
    description:'Structured scientific drafting with Word-mapped styles, headings, figures, tables, validation and A4 output.',
    newDocument(){ return createTextDocument(); }
  },
  {
    id:'scientific-draft-figures', version:'1.0.0', name:'Scientific Draft - Figures', category:'Scientific Content', editor:'structured-form',
    description:'Figure request workflow with five outcomes, source/copyright fields, instructions and quick figure navigation.',
    newDocument(){ return createFigureDocument(); }
  }
];

const state = {
  db:null, view:'home', docs:[], customTemplates:[], current:null, dirty:false,
  activeBlockId:null, activeTableId:null, activeCell:null, selectionBookmark:null,
  history:[], historyIndex:-1, typingTimer:null, saveTimer:null, lastSnapshotAt:0,
  suppressHistory:false, search:''
};

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const byId = id => document.getElementById(id);
const clone = obj => JSON.parse(JSON.stringify(obj));
const nowIso = () => new Date().toISOString();
const uid = (prefix='id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(msg){ const el=byId('toast'); if(!el)return; el.textContent=msg; el.classList.add('show'); clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),1800); }
function setSaveStatus(text){ const el=byId('saveStatus'); if(el) el.textContent=text; }
function fmtDate(iso){ if(!iso)return ''; try{return new Date(iso).toLocaleString();}catch{return iso;} }
function fileSafe(s){ return String(s||'Teryaq_Document').trim().replace(/[^\w\-]+/g,'_').replace(/_+/g,'_').slice(0,80) || 'Teryaq_Document'; }

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
function splitRuns(runs,offset){
  const left=[],right=[];let pos=0;
  for(const r of runs||[]){const end=pos+r.text.length;if(offset<=pos)right.push(clone(r));else if(offset>=end)left.push(clone(r));else{const cut=offset-pos;if(cut)left.push({text:r.text.slice(0,cut),marks:[...(r.marks||[])]});if(cut<r.text.length)right.push({text:r.text.slice(cut),marks:[...(r.marks||[])]});}pos=end;}
  return [normalizeRuns(left),normalizeRuns(right)];
}

// ---------------- App bootstrap ----------------
async function boot(){
  state.db=await openDb();
  TeryaqPlatform.attachDb(state.db);
  TeryaqPlatform.setDataChangedCallback(async()=>{if(TeryaqPlatform.user()){await refreshLibrary();if(state.view==='home')renderDocuments();}});
  bindGlobal();
  const auth=await TeryaqPlatform.initialize();
  window.addEventListener('teryaq-authenticated',async()=>{await afterAuthentication();});
  if(auth.authenticated)await afterAuthentication();
  if('serviceWorker' in navigator && location.protocol!=='file:'){navigator.serviceWorker.register('./sw.js').catch(()=>{});}
  window.addEventListener('resize',()=>{if(state.current?.templateId==='scientific-draft-text')updatePageScale()});
  setInterval(()=>{if(state.current && state.dirty && Date.now()-state.lastSnapshotAt>SNAPSHOT_INTERVAL_MS)createSnapshot('Auto snapshot')},60000);
}
async function afterAuthentication(){
  await TeryaqPlatform.claimAndMigrateLegacyData();await refreshLibrary();renderHome();TeryaqPlatform.updateSyncUi();
  if(navigator.onLine)TeryaqPlatform.syncNow({silent:true});
}
async function refreshLibrary(){
  const u=TeryaqPlatform.user();if(!u){state.docs=[];state.customTemplates=[];return}
  state.docs=(await idbAll('documents')).filter(d=>d.ownerId===u.id).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  state.customTemplates=(await idbAll('templates')).filter(t=>t.ownerId===u.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}
function bindGlobal(){
  byId('homeBtn').onclick=()=>goHome(); byId('importBtn').onclick=()=>byId('importFile').click(); byId('importFile').onchange=e=>e.target.files[0]&&importPackage(e.target.files[0]);
  byId('searchDocs').addEventListener('input',e=>{state.search=e.target.value.toLowerCase();renderDocuments()});
  byId('closeValidation').onclick=()=>byId('validationPanel').classList.add('hidden');
  byId('closeModal').onclick=()=>byId('modal').classList.add('hidden');
  byId('syncBtn').onclick=()=>TeryaqPlatform.syncNow();byId('settingsBtn').onclick=()=>TeryaqPlatform.showSettings();byId('adminBtn').onclick=()=>TeryaqPlatform.showAdminDashboard();
  byId('resolveConflictsBtn').onclick=()=>TeryaqPlatform.resolveConflicts();
}

// ---------------- Home/library ----------------
function renderHome(){
  state.view='home'; byId('docTitle').textContent='Teryaq Author'; $$('.view').forEach(v=>v.classList.remove('active')); byId('homeView').classList.add('active');
  byId('editorActions').classList.add('hidden'); byId('homeActions').classList.remove('hidden'); byId('homeBtn').classList.add('hidden');
  renderTemplates(); renderDocuments();
}
function renderTemplates(){
  const host=byId('templateCards');host.innerHTML='';
  for(const t of [...BUILTIN_TEMPLATES,...state.customTemplates]){
    const card=document.createElement('div');card.className='template-card';card.innerHTML=`<h4>${esc(t.name)}</h4><p>${esc(t.description||'Reusable local template')}</p><div class="meta"><span class="chip">${esc(t.category||'Custom')}</span><span class="chip">v${esc(t.version||'1.0.0')}</span></div><div class="card-actions"><button class="btn primary small">New document</button>${t.custom?'<button class="btn danger small delete-template">Delete template</button>':''}</div>`;
    card.querySelector('.btn.primary').onclick=()=>createFromTemplate(t);
    const del=card.querySelector('.delete-template');if(del)del.onclick=async()=>{if(confirm(`Delete custom template “${t.name}”?`)){await idbDelete('templates',t.id);await refreshLibrary();renderTemplates();}};
    host.appendChild(card);
  }
}
function renderDocuments(){
  const host=byId('documentCards');host.innerHTML='';let docs=state.docs;
  if(state.search)docs=docs.filter(d=>JSON.stringify([d.title,d.metadata?.subject,d.metadata?.chapterTitle,d.metadata?.chapterNumber]).toLowerCase().includes(state.search));
  if(!docs.length){host.innerHTML='<div class="empty-state">No saved documents yet. Create one from a template above.</div>';return;}
  for(const d of docs){
    const t=getTemplate(d.templateId);const card=document.createElement('div');card.className='doc-card';
    card.innerHTML=`<h4>${esc(d.title||'Untitled')}</h4><p>${esc(t?.name||d.templateId)}${d.metadata?.subject?' · '+esc(d.metadata.subject):''}${d.metadata?.chapterNumber?' · CH '+esc(d.metadata.chapterNumber):''}</p><div class="meta"><span class="chip">Edited ${esc(fmtDate(d.updatedAt))}</span><span class="chip sync-chip ${esc(d.sync?.status||'local-only')}">${esc(d.sync?.status||'local-only')}</span></div><div class="card-actions"><button class="btn primary small open">Open</button><button class="btn small duplicate">Duplicate</button><button class="btn small backup">Export .teryaq</button>${d.sync?.status==='conflict'?'<button class="btn small resolve">Resolve conflict</button>':''}<button class="btn danger small delete">Delete</button></div>`;
    card.querySelector('.open').onclick=()=>openDocument(d.id); card.querySelector('.duplicate').onclick=()=>duplicateDocument(d.id); card.querySelector('.backup').onclick=()=>exportDocumentPackage(d); const resolve=card.querySelector('.resolve');if(resolve)resolve.onclick=()=>TeryaqPlatform.resolveConflicts();
    card.querySelector('.delete').onclick=async()=>{if(confirm(`Delete “${d.title}”?`)){await snapshotDocument(d,'Before deletion');await TeryaqPlatform.queueDelete(d);await refreshLibrary();renderDocuments();}};
    host.appendChild(card);
  }
}
async function createFromTemplate(t){
  let doc;
  if(t.custom){doc=clone(t.baseDocument);doc.id=uid('doc');doc.createdAt=doc.updatedAt=nowIso();doc.title=t.name+' - New';}
  else doc=t.newDocument();
  TeryaqPlatform.decorateNewDocument(doc);
  await idbPut('documents',doc);await TeryaqPlatform.queueDocument(doc);await refreshLibrary();openDocument(doc.id);
}
async function duplicateDocument(id){const d=await idbGet('documents',id);if(!d)return;const c=clone(d);c.id=uid('doc');c.title=(d.title||'Document')+' Copy';c.createdAt=c.updatedAt=nowIso();TeryaqPlatform.decorateNewDocument(c);await idbPut('documents',c);await TeryaqPlatform.queueDocument(c);await refreshLibrary();renderDocuments();toast('Duplicated');}
async function openDocument(id){const d=await idbGet('documents',id);if(!d)return;state.current=d;state.dirty=false;resetHistory();state.view='editor';$$('.view').forEach(v=>v.classList.remove('active'));byId('editorView').classList.add('active');byId('homeActions').classList.add('hidden');byId('editorActions').classList.remove('hidden');byId('homeBtn').classList.remove('hidden');renderEditor();pushHistory('Open');}
async function goHome(){if(state.current&&state.dirty)await saveCurrent(true);state.current=null;await refreshLibrary();renderHome();}

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
function markDirty(history=true){if(!state.current)return;state.dirty=true;state.current.updatedAt=nowIso();setSaveStatus('Saving…');if(history)scheduleTypingHistory();clearTimeout(state.saveTimer);state.saveTimer=setTimeout(()=>saveCurrent(false),700)}
async function saveCurrent(manual=false){if(!state.current)return;state.current.updatedAt=nowIso();TeryaqPlatform.markDocumentPending(state.current);await idbPut('documents',clone(state.current));await TeryaqPlatform.queueDocument(state.current);state.dirty=false;setSaveStatus(navigator.onLine?'Saved locally · sync pending':'Saved offline');TeryaqPlatform.updateSyncUi();if(manual)toast('Saved locally')}
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
  byId('syncBtnEditor').onclick=()=>TeryaqPlatform.syncNow();byId('settingsBtnEditor').onclick=()=>TeryaqPlatform.showSettings();
}


// ---------------- Text editor render ----------------
function renderTextEditor(resetSelection=true){
  const d=state.current;renderMeta();renderBlocks();renderOutline();renderRegisters();updatePageScale();if(resetSelection){state.activeBlockId=d.content.blocks[0]?.id||null;state.selectionBookmark=null;}bindTextControls();
}
function renderMeta(){
  const m=state.current.metadata||blankMeta();
  for(const [id,key] of [['metaName','name'],['metaStart','startDate'],['metaEnd','endDate'],['metaSubject','subject'],['metaChapter','chapterNumber'],['metaTitle','chapterTitle'],['metaNotes','generalNotes']]){
    const el=byId(id);el.value=m[key]||'';el.oninput=()=>{state.current.metadata[key]=el.value;if(key==='chapterTitle'||key==='subject'||key==='chapterNumber')updateDocumentTitle();markDirty();renderRegisters()};
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
  let el=document.createElement('div');el.className='doc-block';el.dataset.blockId=block.id;el.dataset.type=block.type;
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
  const ed=document.createElement('div');ed.className='editable';ed.contentEditable='true';ed.spellcheck=true;ed.setAttribute('dir','auto');ed.dataset.placeholder='Type here…';ed.innerHTML=runsToHtml(block.runs||[]);
  ed.addEventListener('input',()=>{block.runs=elementToRuns(ed);captureSelection();markDirty();if(block.style?.startsWith('Heading')){renderOutline();renderRegisters();}});
  ed.addEventListener('focus',()=>{setActiveBlock(block.id);captureSelection()});ed.addEventListener('keyup',captureSelection);ed.addEventListener('mouseup',captureSelection);ed.addEventListener('touchend',()=>setTimeout(captureSelection,0));
  ed.addEventListener('paste',e=>handlePaste(e,block,ed));ed.addEventListener('keydown',e=>handleBlockKeydown(e,block,ed));
  return ed;
}
function handlePaste(e,block,ed){
  e.preventDefault();const text=(e.clipboardData||window.clipboardData).getData('text/plain').replace(/\r\n?/g,'\n');insertPlainTextAtSelection(ed,text);block.runs=elementToRuns(ed);captureSelection();markDirty();
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
  byId('mobileControlsToggle').onclick=()=>byId('leftPanel').classList.toggle('mobile-open');byId('mobileOutlineToggle').onclick=()=>byId('rightPanel').classList.toggle('mobile-open');
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
function insertTable(){const rows=Math.max(2,Math.min(20,+prompt('Rows:','3')||3)),cols=Math.max(2,Math.min(8,+prompt('Columns:','3')||3));const code=prompt('Table code (optional):','')||'',title=prompt('Table title (optional):','')||'';const block={id:uid('tbl'),type:'table',code,title,widths:Array(cols).fill(100/cols),rows:Array.from({length:rows},(_,r)=>Array.from({length:cols},()=>({runs:[]})))};insertBlockAfterActive(block)}
function renderTable(block){
  const wrap=document.createElement('div');const sc=document.createElement('div');sc.className='table-wrap';const table=document.createElement('table');table.className='doc-table';table.dataset.tableId=block.id;const body=document.createElement('tbody');
  block.rows.forEach((row,ri)=>{const tr=document.createElement('tr');row.forEach((cell,ci)=>{const td=document.createElement(ri===0?'th':'td');if(block.widths?.[ci])td.style.width=block.widths[ci]+'%';const ed=document.createElement('div');ed.className='table-cell-editor';ed.contentEditable='true';ed.setAttribute('dir','auto');ed.innerHTML=runsToHtml(cell.runs||[]);ed.addEventListener('focus',()=>selectTableCell(block.id,ri,ci,td));ed.addEventListener('click',()=>selectTableCell(block.id,ri,ci,td));ed.addEventListener('input',()=>{cell.runs=elementToRuns(ed);selectTableCell(block.id,ri,ci,td);markDirty()});ed.addEventListener('paste',e=>{e.preventDefault();insertPlainTextAtSelection(ed,(e.clipboardData||window.clipboardData).getData('text/plain'));cell.runs=elementToRuns(ed);markDirty()});td.appendChild(ed);tr.appendChild(td)});body.appendChild(tr)});table.appendChild(body);sc.appendChild(table);wrap.appendChild(sc);
  const cap=document.createElement('div');cap.className='table-caption';cap.textContent=block.code||block.title?`Table ${block.code}${block.code&&block.title?' - ':''}${block.title}`:'';wrap.appendChild(cap);return wrap;
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
function renderRegisters(){const h=headingStructure();const hr=byId('headingRegister');if(hr){hr.innerHTML='<div class="heading-register-head">Headings 1</div>';const count=Math.max(12,h.length);for(let i=0;i<count;i++){const row=document.createElement('div');row.className='heading-register-row';row.innerHTML=`<span class="n">${i+1}</span><span>${esc(h[i]?.title||'')}</span>`;hr.appendChild(row)}}const tables=state.current.content.blocks.filter(b=>b.type==='table'&&(b.code||b.title));const tr=byId('tableRegister');if(tr){tr.innerHTML='';if(!tables.length){tr.innerHTML='<div class="table-register-row"><span class="code">Table code</span><span>Table title</span></div>'}else tables.forEach(t=>{const row=document.createElement('div');row.className='table-register-row';row.innerHTML=`<span class="code">${esc(t.code||'')}</span><span>${esc(t.title||'')}</span>`;tr.appendChild(row)})}}

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
async function importPackage(file){try{const txt=await file.text();const pkg=JSON.parse(txt);let doc=pkg.document||pkg;if(!doc.templateId||!doc.content)throw new Error('Not a Teryaq document');await snapshotIfConflict(doc);if(await idbGet('documents',doc.id)){doc=clone(doc);doc.id=uid('doc');doc.title=(doc.title||'Imported')+' Imported';}if(String(doc.schemaVersion||'1.0.0')>SCHEMA_VERSION)throw new Error('This document was created with a newer document schema. Update Teryaq Author before editing it.');doc=TeryaqPlatform.decorateImportedDocument(doc);doc.updatedAt=nowIso();await idbPut('documents',doc);await TeryaqPlatform.queueDocument(doc);await refreshLibrary();renderHome();toast('Imported successfully')}catch(e){alert('Import failed: '+e.message)}finally{byId('importFile').value=''}}
async function snapshotIfConflict(doc){const old=await idbGet('documents',doc.id);if(old)await snapshotDocument(old,'Before import conflict')}
async function saveAsTemplate(){const name=prompt('Template name:',(state.current.title||'Document')+' Template');if(!name)return;const base=clone(state.current);base.id='TEMPLATE_BASE';base.createdAt=base.updatedAt='';if(base.metadata){for(const k of Object.keys(base.metadata))base.metadata[k]=''}const t={id:uid('tpl'),ownerId:TeryaqPlatform.user()?.id,custom:true,name,version:'1.0.0',category:'Custom',description:'Custom reusable template saved locally.',editor:getTemplate(state.current.templateId)?.editor||'rich-document',baseDocument:base,createdAt:nowIso()};await idbPut('templates',t);await refreshLibrary();toast('Saved as reusable template')}

// ---------------- Version history ----------------
async function showSnapshots(){if(!state.current)return;const snaps=(await idbByIndex('snapshots','documentId',state.current.id)).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,50);const body=byId('modalBody');body.innerHTML='<h3>Version History</h3>';if(!snaps.length)body.innerHTML+='<p>No recovery snapshots yet.</p>';snaps.forEach(s=>{const r=document.createElement('div');r.className='snapshot-row';r.innerHTML=`<div><strong>${esc(fmtDate(s.createdAt))}</strong><br><small>${esc(s.reason||'Snapshot')}</small></div><button class="btn small">Restore</button>`;r.querySelector('button').onclick=async()=>{if(confirm('Restore this snapshot? Current state will first be saved as a snapshot.')){await createSnapshot('Before restore');state.current=clone(s.document);await saveCurrent(false);resetHistory();renderEditor();pushHistory('Restored');byId('modal').classList.add('hidden');toast('Snapshot restored')}};body.appendChild(r)});byId('modal').classList.remove('hidden')}

// ---------------- Print renderer ----------------
function printCurrent(){const issues=validateCurrent();if(issues.some(i=>i.level==='error')&&!confirm('Validation has errors. Print anyway?'))return;const html=state.current.templateId==='scientific-draft-text'?buildTextPrintHtml(state.current):buildFigurePrintHtml(state.current);const w=window.open('','_blank');if(!w)return alert('Please allow popups for printing.');w.document.open();w.document.write(html);w.document.close();setTimeout(()=>{w.focus();w.print()},450)}
function basePrintCss(){return `@page{size:A4;margin:21mm 16mm 18mm}*{box-sizing:border-box}body{margin:0;font-family:Tajawal,Arial,sans-serif;color:#000;font-size:11pt;line-height:1.30}.cover{page-break-after:always}.meta{width:100%;border-collapse:collapse}.meta td{border:1px solid #000;padding:6px}.meta td:first-child{width:28%;font-weight:bold}.reg{width:100%;border-collapse:collapse;margin-top:14px}.reg td,.reg th{border:1px solid #000;padding:5px}.h1{font-size:14pt;font-weight:bold;color:#C45911;margin:12pt 0 0}.h2{font-size:13pt;font-weight:bold;color:#538135;margin:2pt 0 0}.h3{font-size:12pt;font-weight:bold;color:#2E74B5;margin:2pt 0 0}.h4{font-size:11pt;font-style:italic;color:#2F5496}.subtitle{color:#7F7F7F}.caption{font-size:9pt;font-style:italic;color:#767171}.fig{background:#FFED29;color:#176A98;text-align:center;font-weight:bold;padding:7px 10px;margin:8pt 0 10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-inside:avoid}.bullet{display:grid;grid-template-columns:18px 1fr;gap:5px}.l1{margin-left:26pt}.l2{margin-left:44pt}.l3{margin-left:62pt}.num{display:grid;grid-template-columns:25px 1fr;gap:5px;margin-left:20pt}table.data{width:100%;border-collapse:collapse;table-layout:fixed;margin:3pt 0}table.data td,table.data th{border:1px solid #000;padding:5pt 6pt;vertical-align:top;overflow-wrap:anywhere}table.data thead{display:table-header-group}table.data tr{break-inside:avoid}.SideNote{color:#BF8F00}.NotesToDelete{color:#FF0000;font-weight:bold;font-size:9pt}.HighYield{color:#7030A0;font-weight:bold;text-decoration:underline}.ClinicalCorrelation{color:#39E794}h1,h2,h3,h4{break-after:avoid}`}
function runsPrintHtml(runs){return normalizeRuns(runs).map(r=>{let h=esc(r.text).replace(/\n/g,'<br>');const m=r.marks||[];if(m.includes('bold'))h=`<strong>${h}</strong>`;if(m.includes('italic'))h=`<em>${h}</em>`;for(const x of ['SideNote','NotesToDelete','HighYield','ClinicalCorrelation'])if(m.includes(x))h=`<span class="${x}">${h}</span>`;const fs=m.find(x=>x.startsWith('font:'));if(fs)h=`<span style="font-size:${esc(fs.split(':')[1])}pt">${h}</span>`;return h}).join('')}
function buildTextPrintHtml(d){let h1=0,h2=0,num=0;const headings=[],tables=[];let body='';for(const b of d.content.blocks){if(b.type==='paragraph'){let cls='';let prefix='';if(b.style==='Heading1'){h1++;h2=0;cls='h1';prefix=h1+'. ';headings.push({n:h1,title:plainText(b.runs)})}else if(b.style==='Heading2'){h2++;cls='h2';prefix=h2+'. '}else if(b.style==='Heading3')cls='h3';else if(b.style==='Heading4')cls='h4';else if(b.style==='Subtitle')cls='subtitle';else if(b.style==='TableCaption')cls='caption';body+=`<div class="${cls}">${prefix}${runsPrintHtml(b.runs)}</div>`;num=0}else if(b.type==='bullet'){body+=`<div class="bullet l${b.level}"><span>${STYLE_CONTRACT.BulletLevels[b.level].marker}</span><div>${runsPrintHtml(b.runs)}</div></div>`;num=0}else if(b.type==='number'){num++;body+=`<div class="num"><span>${num}.</span><div>${runsPrintHtml(b.runs)}</div></div>`}else if(b.type==='figure_placeholder'){body+=`<div class="fig">[POSITION OF ${b.placement==='margin'?'MARGIN ':''}FIGURE ${esc(b.code)}]</div>`;num=0}else if(b.type==='table'){tables.push(b);body+=tablePrintHtml(b);num=0}}
  const m=d.metadata||{};const metaRows=[['Name',m.name],['Start date',m.startDate],['End date',m.endDate],['Subject',m.subject],['Chapter number',m.chapterNumber],['Chapter title',m.chapterTitle]].map(x=>`<tr><td>${esc(x[0])}</td><td>${esc(x[1]||'')}</td></tr>`).join('');const reg=Array.from({length:Math.max(12,headings.length)},(_,i)=>`<tr><td style="width:9%"><b>${i+1}</b></td><td>${esc(headings[i]?.title||'')}</td></tr>`).join('');const treg=tables.length?tables.map(t=>`<tr><td><b>${esc(t.code||'')}</b></td><td>${esc(t.title||'')}</td></tr>`).join(''):'<tr><td><b>Table code</b></td><td><b>Table title</b></td></tr>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${basePrintCss()}</style></head><body><section class="cover"><table class="meta">${metaRows}</table><table class="reg"><tr><th colspan="2" style="text-align:left">Headings 1</th></tr>${reg}</table><table class="reg">${treg}</table></section><main>${body}</main></body></html>`}
function tablePrintHtml(b){const rows=b.rows.map((r,ri)=>`<tr>${r.map((c,ci)=>`<${ri===0?'th':'td'} style="width:${b.widths?.[ci]||''}%">${runsPrintHtml(c.runs)}</${ri===0?'th':'td'}>`).join('')}</tr>`).join('');return `<table class="data"><tbody>${rows}</tbody></table>${b.code||b.title?`<div class="caption">Table ${esc(b.code||'')}${b.code&&b.title?' - ':''}${esc(b.title||'')}</div>`:''}`}
function buildFigurePrintHtml(d){const m=d.metadata||{};const cards=(d.content.figures||[]).map(f=>`<section style="break-after:page;margin-bottom:15mm"><table class="meta"><tr><td>Figure code</td><td>${esc(f.code)}</td></tr><tr><td>Figure title</td><td>${esc(f.title)}</td></tr><tr><td>Caption</td><td>${esc(f.caption)}</td></tr><tr><td>Source</td><td>${esc(f.source)}</td></tr><tr><td>Order</td><td>${esc(f.order)}</td></tr><tr><td>Details</td><td>${esc(f.details)}</td></tr><tr><td>Copyright status</td><td>${esc(f.copyright)}</td></tr><tr><td>Notes</td><td>${esc(f.notes)}</td></tr></table>${f.image?`<div style="text-align:center;margin-top:10mm"><img src="${f.image}" style="max-width:100%;max-height:120mm"></div>`:''}</section>`).join('');return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.title)}</title><style>${basePrintCss()} img{object-fit:contain}</style></head><body><section class="cover"><table class="meta"><tr><td>Name</td><td>${esc(m.name)}</td></tr><tr><td>Subject</td><td>${esc(m.subject)}</td></tr><tr><td>Chapter number</td><td>${esc(m.chapterNumber)}</td></tr><tr><td>Chapter title</td><td>${esc(m.chapterTitle)}</td></tr><tr><td>General notes</td><td>${esc(m.generalNotes)}</td></tr></table></section>${cards}</body></html>`}

// ---------------- Figure editor ----------------
const FIG_ORDERS=['Order 1 - KEEP as it is','Order 2 - DO the following changes','Order 3 - RECREATE with Ai','Order 4 - DESIGN by Teryaq','Order 5 - SEARCH for a Figure'];
function renderFigureEditor(){const d=state.current,m=d.metadata;byId('addFigureBtn').onclick=()=>{d.content.figures.push(blankFigure());markDirty(false);pushHistory('Add figure');renderFigureCards();renderFigureNav();setTimeout(()=>byId(`fig-card-${d.content.figures.length}`)?.scrollIntoView({behavior:'smooth',block:'start'}),0)};for(const [id,key] of [['figMetaName','name'],['figMetaSubject','subject'],['figMetaChapter','chapterNumber'],['figMetaTitle','chapterTitle'],['figMetaNotes','generalNotes']]){const el=byId(id);el.value=m[key]||'';el.oninput=()=>{m[key]=el.value;if(key!=='generalNotes')d.title=[m.subject,m.chapterNumber?`CH ${m.chapterNumber}`:'',m.chapterTitle,'Figures'].filter(Boolean).join(' — ')||'Untitled Figures Draft';byId('docTitle').textContent=d.title;markDirty()}}renderFigureCards();renderFigureNav();}
function renderFigureCards(){const host=byId('figureCards');host.innerHTML='';state.current.content.figures.forEach((f,i)=>host.appendChild(renderFigureCard(f,i)))}
function renderFigureCard(f,i){const sec=document.createElement('section');sec.className='figure-card';sec.id=`fig-card-${i+1}`;sec.innerHTML=`<div class="figure-card-head"><div><strong>Figure ${i+1}</strong> <span class="chip">${esc(f.code||'No code')}</span></div><div class="card-actions"><button class="btn small duplicate">Duplicate</button><button class="btn danger small delete">Delete</button></div></div><div class="figure-card-body"><div class="figure-grid">
<div class="field"><label>Figure code *</label><input data-k="code" value="${esc(f.code)}" placeholder="e.g., 3.1"></div><div class="field"><label>Figure title *</label><input data-k="title" value="${esc(f.title)}"></div><div class="field span-2"><label>Caption</label><textarea data-k="caption">${esc(f.caption)}</textarea></div><div class="field span-2"><label>Source *</label><input data-k="source" value="${esc(f.source)}" placeholder="URL, book + page, or Teryaq"></div><div class="field"><label>Order *</label><select data-k="order"><option value="">Select order…</option>${FIG_ORDERS.map(o=>`<option ${o===f.order?'selected':''}>${esc(o)}</option>`).join('')}</select></div><div class="field"><label>Copyright status *</label><select data-k="copyright"><option value="">Select status…</option>${['There is copyright issues','There is no copyright issues',"I don't know"].map(o=>`<option ${o===f.copyright?'selected':''}>${esc(o)}</option>`).join('')}</select></div><div class="field span-2"><label>PROMPT — Details</label><textarea data-k="details">${esc(f.details)}</textarea></div><div class="field span-2"><label>Notes</label><textarea data-k="notes">${esc(f.notes)}</textarea></div><div class="field span-2"><label>Figure / reference image</label><div class="dropzone"><div class="drop-content">${f.image?`<img src="${f.image}">`:'Click or drop image here'}</div><input type="file" accept="image/*" hidden></div><div class="card-actions"><button class="btn small clear-image">Clear image</button></div></div></div></div>`;
  sec.querySelectorAll('[data-k]').forEach(el=>el.addEventListener('input',()=>{f[el.dataset.k]=el.value;markDirty();renderFigureNav()}));sec.querySelector('.duplicate').onclick=()=>{const c=clone(f);c.id=uid('fig');state.current.content.figures.splice(i+1,0,c);markDirty(false);pushHistory('Duplicate figure');renderFigureCards();renderFigureNav()};sec.querySelector('.delete').onclick=()=>{if(confirm('Delete this figure?')){state.current.content.figures.splice(i,1);if(!state.current.content.figures.length)state.current.content.figures.push(blankFigure());markDirty(false);pushHistory('Delete figure');renderFigureCards();renderFigureNav()}};
  const dz=sec.querySelector('.dropzone'),inp=dz.querySelector('input');dz.onclick=e=>{if(e.target.closest('.clear-image'))return;inp.click()};dz.ondragover=e=>e.preventDefault();dz.ondrop=e=>{e.preventDefault();if(e.dataTransfer.files[0])loadFigImage(e.dataTransfer.files[0],f)};inp.onchange=()=>inp.files[0]&&loadFigImage(inp.files[0],f);sec.querySelector('.clear-image').onclick=()=>{f.image='';markDirty();renderFigureCards()};return sec;
}
function loadFigImage(file,f){if(!file.type.startsWith('image/'))return;const r=new FileReader();r.onload=()=>{f.image=r.result;markDirty(false);pushHistory('Add figure image');renderFigureCards()};r.readAsDataURL(file)}
function renderFigureNav(){const host=byId('figureNavButtons');host.innerHTML='';state.current.content.figures.forEach((f,i)=>{const b=document.createElement('button');b.textContent=i+1;b.title=f.title||`Figure ${i+1}`;b.onclick=()=>byId(`fig-card-${i+1}`).scrollIntoView({behavior:'smooth',block:'start'});host.appendChild(b)})}

// ---------------- Responsive page scale ----------------
function updatePageScale(){if(innerWidth<760||innerWidth>=1400)return;const host=byId('pageWrap'),page=byId('writingPage');if(!host||!page)return;const available=host.clientWidth;const raw=794;const scale=Math.min(1,Math.max(.62,(available-4)/raw));document.documentElement.style.setProperty('--page-scale',scale.toFixed(3));}

// ---------------- Mobile fixed controls behavior ----------------
function wireMobile(){/* CSS-driven; buttons bound in bindTextControls */}

// ---------------- Init ----------------
document.addEventListener('DOMContentLoaded',()=>boot().catch(e=>{console.error(e);alert('Teryaq Author failed to start: '+e.message)}));

})();
