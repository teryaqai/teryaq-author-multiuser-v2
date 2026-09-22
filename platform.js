/* TERYAQ Master Tool Platform v2.2.0
   Account isolation, offline authentication cache, device registration,
   sync queue, conflict handling, workspace backups, admin read dashboard,
   and safe local-data migrations. No service-role key is ever used client-side. */
(() => {
'use strict';

const APP_VERSION='2.2.0';
const DOCUMENT_SCHEMA_VERSION='2.0.0';
const PLATFORM_SCHEMA=2;
const DEVICE_KEY='deviceId';
const AUTH_KEY='authSession';
const CONFIG_KEY='cloudConfig';
const LAST_SYNC_KEY='lastSyncAt';
const AUTO_SYNC_KEY='autoSyncEnabled';
const AUTO_SYNC_INTERVAL_MS=30000;
const AUTO_SYNC_DEBOUNCE_MS=1200;
let db=null;
let currentUser=null;
let session=null;
let dataChangedCb=null;
let syncRunning=false;
let autoSyncInterval=null;
let autoSyncTimeout=null;

const $=s=>document.querySelector(s);
const byId=id=>document.getElementById(id);
const now=()=>new Date().toISOString();
const clone=o=>JSON.parse(JSON.stringify(o));
const uid=(p='id')=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function tx(store,mode='readonly'){return db.transaction(store,mode).objectStore(store)}
function get(store,key){return new Promise((res,rej)=>{const r=tx(store).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(store,val){return new Promise((res,rej)=>{const r=tx(store,'readwrite').put(val);r.onsuccess=()=>res(val);r.onerror=()=>rej(r.error)})}
function del(store,key){return new Promise((res,rej)=>{const r=tx(store,'readwrite').delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
function all(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
function byIndex(store,index,key){return new Promise((res,rej)=>{const r=tx(store).index(index).getAll(key);r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error)})}
async function settingGet(key){return (await get('settings',key))?.value}
async function settingPut(key,value){return put('settings',{key,value,updatedAt:now()})}

function attachDb(database){db=database}
function setDataChangedCallback(fn){dataChangedCb=fn}
function emitDataChanged(){try{dataChangedCb?.()}catch(e){console.error(e)}}
function isOnline(){return navigator.onLine!==false}
function user(){return currentUser}
function isAdmin(){return currentUser?.role==='admin'}
function configured(c){return !!(c?.projectUrl&&c?.anonKey)}
function normalizeUrl(u){return String(u||'').trim().replace(/\/+$/,'')}

async function getConfig(){return (await settingGet(CONFIG_KEY))||{projectUrl:'',anonKey:''}}
async function saveConfig(config){const clean={projectUrl:normalizeUrl(config.projectUrl),anonKey:String(config.anonKey||'').trim()};await settingPut(CONFIG_KEY,clean);return clean}
async function getAutoSyncEnabled(){return (await settingGet(AUTO_SYNC_KEY))!==false}
async function setAutoSyncEnabled(enabled){
  const value=Boolean(enabled);await settingPut(AUTO_SYNC_KEY,value);
  if(value){startAutoSync();scheduleAutoSync(0)}else stopAutoSync();
  await updateSyncUi();return value
}
function stopAutoSync(){
  if(autoSyncInterval){clearInterval(autoSyncInterval);autoSyncInterval=null}
  if(autoSyncTimeout){clearTimeout(autoSyncTimeout);autoSyncTimeout=null}
}
function startAutoSync(){
  if(autoSyncInterval)clearInterval(autoSyncInterval);
  autoSyncInterval=setInterval(()=>scheduleAutoSync(0),AUTO_SYNC_INTERVAL_MS);
  scheduleAutoSync(0)
}
async function scheduleAutoSync(delay=AUTO_SYNC_DEBOUNCE_MS){
  if(!currentUser||!isOnline()||!await getAutoSyncEnabled())return;
  if(autoSyncTimeout)clearTimeout(autoSyncTimeout);
  autoSyncTimeout=setTimeout(()=>{autoSyncTimeout=null;syncNow({silent:true})},Math.max(0,delay))
}
async function getDeviceId(){let id=await settingGet(DEVICE_KEY);if(!id){id=uid('device');await settingPut(DEVICE_KEY,id)}return id}
function platformName(){const ua=navigator.userAgent||'';if(/iPad|iPhone|iPod/.test(ua))return 'iOS/iPadOS';if(/Android/.test(ua))return 'Android';if(/Windows/.test(ua))return 'Windows';if(/Macintosh|Mac OS/.test(ua))return 'macOS';return 'Web'}
function deviceName(){return `${platformName()} · ${navigator.platform||'Device'}`}

async function apiFetch(path,{method='GET',body=null,auth=true,headers={}}={}){
  const cfg=await getConfig();
  if(!configured(cfg))throw new Error('Cloud connection is not configured on this device.');
  if(!isOnline())throw new Error('Offline');
  if(auth)await ensureSessionFresh();
  const h={'apikey':cfg.anonKey,'Content-Type':'application/json',...headers};
  if(auth&&session?.access_token)h['Authorization']=`Bearer ${session.access_token}`;
  const resp=await fetch(`${cfg.projectUrl}${path}`,{method,headers:h,body:body==null?undefined:JSON.stringify(body)});
  if(!resp.ok){let msg=`HTTP ${resp.status}`;try{const j=await resp.json();msg=j.msg||j.message||j.error_description||j.error||msg}catch{}throw new Error(msg)}
  if(resp.status===204)return null;
  const text=await resp.text();if(!text)return null;try{return JSON.parse(text)}catch{return text}
}

async function signIn(email,password){
  const cfg=await getConfig();if(!configured(cfg))throw new Error('Configure the Supabase project first.');
  const data=await apiFetch('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password},auth:false});
  session=data;await settingPut(AUTH_KEY,session);
  const authUser=data.user||{};
  let profile=null;
  try{const rows=await apiFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,email,display_name,role`);profile=Array.isArray(rows)?rows[0]:null}catch{}
  currentUser={id:authUser.id,email:authUser.email||email,displayName:profile?.display_name||authUser.user_metadata?.name||'',role:profile?.role||'user',lastAuthenticatedAt:now()};
  await put('accounts',currentUser);
  await registerDevice();
  await claimAndMigrateLegacyData();
  return currentUser;
}

async function ensureSessionFresh(){
  if(!session)session=await settingGet(AUTH_KEY);
  if(!session)throw new Error('Not signed in');
  const exp=(session.expires_at||0)*1000;
  if(exp>Date.now()+120000)return session;
  if(!isOnline())return session;
  if(!session.refresh_token)throw new Error('Session expired. Please sign in again.');
  const data=await apiFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token},auth:false});
  session=data;await settingPut(AUTH_KEY,session);return session;
}

async function restoreCachedSession(){
  session=await settingGet(AUTH_KEY);if(!session?.user?.id)return null;
  const cached=await get('accounts',session.user.id);
  if(!cached)return null;
  if(isOnline()){
    try{await ensureSessionFresh();const rows=await apiFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,email,display_name,role`);const p=Array.isArray(rows)?rows[0]:null;currentUser={...cached,email:p?.email||cached.email,displayName:p?.display_name||cached.displayName,role:p?.role||cached.role||'user'};await put('accounts',currentUser);await registerDevice();return currentUser}catch(e){console.warn('Online session validation failed:',e.message);return null}
  }
  currentUser=cached;return currentUser;
}

async function continueOffline(){
  session=await settingGet(AUTH_KEY);if(!session?.user?.id)throw new Error('No previously authenticated account is available offline.');
  const cached=await get('accounts',session.user.id);if(!cached)throw new Error('No local account cache exists.');currentUser=cached;return cached;
}

async function signOut(){stopAutoSync();session=null;currentUser=null;await settingPut(AUTH_KEY,null)}

async function changePassword(newPassword){
  const password=String(newPassword||'');
  if(password.length<8)throw new Error('Password must be at least 8 characters.');
  if(!currentUser)throw new Error('Sign in first.');
  await apiFetch('/auth/v1/user',{method:'PUT',body:{password}});
  return true
}

async function registerDevice(){
  if(!currentUser||!isOnline())return;
  const id=await getDeviceId();const rec={id,user_id:currentUser.id,device_name:deviceName(),platform:platformName(),app_version:APP_VERSION,last_seen_at:now()};
  try{await apiFetch('/rest/v1/devices?on_conflict=id',{method:'POST',body:rec,headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}})}catch(e){console.warn('Device registration:',e.message)}
  await put('devices',{id,ownerId:currentUser.id,...rec});
}

function migrateDocument(doc,ownerId){
  const d=clone(doc);d.ownerId=d.ownerId||ownerId;d.createdWithAppVersion=d.createdWithAppVersion||d.appVersion||'1.0.0';d.lastEditedWithAppVersion=APP_VERSION;d.appVersion=APP_VERSION;d.schemaVersion=DOCUMENT_SCHEMA_VERSION;d.templateVersion=d.templateVersion||'1.0.0';d.sync=d.sync||{status:'local-only',baseServerVersion:0,lastSyncedAt:null,lastError:null};d.sync.status=d.sync.status||'local-only';d.sync.baseServerVersion=Number(d.sync.baseServerVersion||0);return d;
}

async function claimAndMigrateLegacyData(){
  if(!currentUser)return;
  const docs=await all('documents'),templates=await all('templates'),snaps=await all('snapshots');
  const legacyDocs=docs.filter(d=>!d.ownerId),legacyTemplates=templates.filter(t=>!t.ownerId),legacySnaps=snaps.filter(x=>!x.ownerId);
  const owned=docs.filter(d=>d.ownerId===currentUser.id&&d.schemaVersion!==DOCUMENT_SCHEMA_VERSION);
  if(!legacyDocs.length&&!legacyTemplates.length&&!legacySnaps.length&&!owned.length)return;
  const backup={id:uid('migration'),ownerId:currentUser.id,createdAt:now(),fromAppVersion:'1.x',toAppVersion:APP_VERSION,documents:clone([...legacyDocs,...owned]),templates:clone(legacyTemplates),snapshots:clone(legacySnaps)};await put('migrationBackups',backup);
  let claim=true;const legacyCount=legacyDocs.length+legacyTemplates.length+legacySnaps.length;
  if(legacyCount)claim=confirm(`This device contains legacy local data created before accounts were introduced (${legacyDocs.length} documents, ${legacyTemplates.length} custom templates, ${legacySnaps.length} snapshots).

Claim this legacy workspace for ${currentUser.email}?

A complete pre-migration backup has already been created.`);
  if(claim){
    for(const d of legacyDocs)await put('documents',migrateDocument(d,currentUser.id));
    for(const t of legacyTemplates){t.ownerId=currentUser.id;await put('templates',t)}
    for(const snap of legacySnaps){snap.ownerId=currentUser.id;if(snap.document){snap.document.ownerId=currentUser.id;snap.document=migrateDocument(snap.document,currentUser.id)}await put('snapshots',snap)}
  }
  for(const d of owned)await put('documents',migrateDocument(d,currentUser.id));
}

function decorateNewDocument(doc){if(!currentUser)throw new Error('No active account');const d=doc;d.ownerId=currentUser.id;d.schemaVersion=DOCUMENT_SCHEMA_VERSION;d.createdWithAppVersion=APP_VERSION;d.lastEditedWithAppVersion=APP_VERSION;d.appVersion=APP_VERSION;d.sync={status:'pending',baseServerVersion:0,lastSyncedAt:null,lastError:null};return d}
function decorateImportedDocument(doc){const d=migrateDocument(doc,currentUser.id);d.ownerId=currentUser.id;d.sync={status:'pending',baseServerVersion:0,lastSyncedAt:null,lastError:null};return d}
function markDocumentPending(doc){if(!doc||!currentUser)return doc;doc.ownerId=currentUser.id;doc.lastEditedWithAppVersion=APP_VERSION;doc.appVersion=APP_VERSION;doc.schemaVersion=DOCUMENT_SCHEMA_VERSION;doc.sync=doc.sync||{};if(doc.sync.status!=='conflict')doc.sync.status='pending';doc.sync.lastError=null;return doc}
async function queueDocument(doc){if(!doc||!currentUser)return;markDocumentPending(doc);await put('syncQueue',{id:`${currentUser.id}:${doc.id}`,ownerId:currentUser.id,documentId:doc.id,operation:'upsert',queuedAt:now()});updateSyncUi();scheduleAutoSync()}
async function queueDelete(doc){if(!doc||!currentUser)return;await put('tombstones',{id:`${currentUser.id}:${doc.id}`,ownerId:currentUser.id,documentId:doc.id,baseServerVersion:Number(doc.sync?.baseServerVersion||0),deletedAt:now(),title:doc.title||''});await put('syncQueue',{id:`${currentUser.id}:${doc.id}`,ownerId:currentUser.id,documentId:doc.id,operation:'delete',queuedAt:now()});await del('documents',doc.id);updateSyncUi();scheduleAutoSync()}

async function ownedDocuments(){if(!currentUser)return[];return (await all('documents')).filter(d=>d.ownerId===currentUser.id)}
async function ownedTemplates(){if(!currentUser)return[];return (await all('templates')).filter(t=>t.ownerId===currentUser.id)}
async function ownedSnapshots(){if(!currentUser)return[];return (await all('snapshots')).filter(s=>s.ownerId===currentUser.id)}

async function pushQueueItem(item){
  const owner=currentUser.id;
  if(item.operation==='delete'){
    const tomb=await get('tombstones',item.id);if(!tomb){await del('syncQueue',item.id);return}
    const result=await apiFetch('/rest/v1/rpc/push_document',{method:'POST',body:{p_document_id:tomb.documentId,p_base_version:tomb.baseServerVersion||0,p_document:null,p_deleted:true}});
    if(result?.status==='conflict'){await put('conflicts',{id:`${owner}:${tomb.documentId}`,ownerId:owner,documentId:tomb.documentId,createdAt:now(),kind:'delete',local:null,remote:result.server_document,serverVersion:result.current_version});return}
    await del('syncQueue',item.id);await del('tombstones',item.id);return;
  }
  let doc=await get('documents',item.documentId);if(!doc){await del('syncQueue',item.id);return}
  const clean=clone(doc);delete clean.sync;
  const result=await apiFetch('/rest/v1/rpc/push_document',{method:'POST',body:{p_document_id:doc.id,p_base_version:Number(doc.sync?.baseServerVersion||0),p_document:clean,p_deleted:false}});
  if(result?.status==='conflict'){
    doc.sync={...(doc.sync||{}),status:'conflict',lastError:'Server changed since this device last synced.'};await put('documents',doc);await put('conflicts',{id:`${owner}:${doc.id}`,ownerId:owner,documentId:doc.id,createdAt:now(),kind:'edit',local:clone(doc),remote:result.server_document,serverVersion:result.current_version});return;
  }
  doc.sync={status:'synced',baseServerVersion:Number(result?.current_version||doc.sync?.baseServerVersion||1),lastSyncedAt:now(),lastError:null};await put('documents',doc);await del('syncQueue',item.id);
}

async function pullRemote(){
  const rows=await apiFetch(`/rest/v1/documents?owner_id=eq.${encodeURIComponent(currentUser.id)}&select=id,owner_id,document_json,current_version,updated_at,deleted_at&order=updated_at.asc`);
  for(const r of rows||[]){
    const local=await get('documents',r.id);const remoteVersion=Number(r.current_version||0);
    if(r.deleted_at){if(local&&local.sync?.status==='pending'){await put('conflicts',{id:`${currentUser.id}:${r.id}`,ownerId:currentUser.id,documentId:r.id,createdAt:now(),kind:'remote-delete',local:clone(local),remote:null,serverVersion:remoteVersion});local.sync.status='conflict';await put('documents',local)}else if(local)await del('documents',r.id);continue}
    if(!r.document_json)continue;
    if(local?.sync?.status==='pending'&&remoteVersion>Number(local.sync?.baseServerVersion||0)){
      local.sync.status='conflict';await put('documents',local);await put('conflicts',{id:`${currentUser.id}:${r.id}`,ownerId:currentUser.id,documentId:r.id,createdAt:now(),kind:'edit',local:clone(local),remote:clone(r.document_json),serverVersion:remoteVersion});continue;
    }
    if(!local||local.sync?.status!=='pending'){
      const d=migrateDocument(r.document_json,currentUser.id);d.ownerId=currentUser.id;d.sync={status:'synced',baseServerVersion:remoteVersion,lastSyncedAt:now(),lastError:null};await put('documents',d)
    }
  }
}

function versionParts(v){return String(v||'0').split('.').map(x=>parseInt(x,10)||0)}
function versionLt(a,b){const aa=versionParts(a),bb=versionParts(b);for(let i=0;i<Math.max(aa.length,bb.length);i++){const x=aa[i]||0,y=bb[i]||0;if(x<y)return true;if(x>y)return false}return false}
async function checkServerCompatibility(){
  try{const rows=await apiFetch('/rest/v1/system_config?key=in.(min_supported_app_version,current_document_schema)&select=key,value');const map=new Map((rows||[]).map(r=>[r.key,r.value]));const min=map.get('min_supported_app_version');if(min&&versionLt(APP_VERSION,String(min)))throw new Error(`This server now requires TERYAQ Master Tool ${min} or newer. Update the app before syncing.`);return true}catch(e){if(/requires TERYAQ Master Tool/.test(e.message))throw e;console.warn('Compatibility check unavailable:',e.message);return true}
}

async function syncNow({silent=false}={}){
  if(syncRunning)return;const cfg=await getConfig();if(!currentUser||!configured(cfg)||!isOnline()){updateSyncUi();if(!silent&&!isOnline())alert('You are offline. Your work remains saved locally and will sync when the connection returns.');return}
  syncRunning=true;setSyncLabel('Syncing…');
  try{
    await ensureSessionFresh();await checkServerCompatibility();await registerDevice();
    const q=(await all('syncQueue')).filter(x=>x.ownerId===currentUser.id).sort((a,b)=>String(a.queuedAt).localeCompare(String(b.queuedAt)));
    for(const item of q)await pushQueueItem(item);
    await pullRemote();await settingPut(LAST_SYNC_KEY,now());setSyncLabel('Synced ✓');emitDataChanged();
  }catch(e){console.error(e);setSyncLabel('Sync error');const docs=await ownedDocuments();for(const d of docs){if(d.sync?.status==='pending'){d.sync.lastError=e.message;await put('documents',d)}}if(!silent)alert(`Sync failed: ${e.message}`)}finally{syncRunning=false;updateSyncUi()}
}

function setSyncLabel(text){for(const id of ['syncStatus','syncStatusEditor']){const el=byId(id);if(el)el.textContent=text}}
async function updateSyncUi(){
  const els=['syncStatus','syncStatusEditor'].map(byId).filter(Boolean);if(!els.length)return;const conflictButton=byId('resolveConflictsBtn');if(!currentUser){els.forEach(el=>el.textContent='');if(conflictButton)conflictButton.classList.add('hidden');return}
  const q=(await all('syncQueue')).filter(x=>x.ownerId===currentUser.id);const conflicts=(await all('conflicts')).filter(x=>x.ownerId===currentUser.id);const autoSync=await getAutoSyncEnabled();
  const text=conflicts.length?`${conflicts.length} conflict${conflicts.length===1?'':'s'}`:q.length?(isOnline()?(autoSync?`${q.length} syncing soon`:`${q.length} waiting · auto-sync off`):`${q.length} offline change${q.length===1?'':'s'}`):(isOnline()?(autoSync?'Synced ✓':'Online · auto-sync off'):'Offline · saved locally');els.forEach(el=>el.textContent=text);if(conflictButton){conflictButton.classList.toggle('hidden',!conflicts.length);conflictButton.textContent=`Conflicts (${conflicts.length})`}
}

async function conflictCount(){return currentUser?(await all('conflicts')).filter(c=>c.ownerId===currentUser.id).length:0}
async function resolveConflicts(documentId=null){
  if(!currentUser)return;const items=(await all('conflicts')).filter(c=>c.ownerId===currentUser.id&&(!documentId||c.documentId===documentId));const body=byId('modalBody');body.innerHTML=`<h3>${documentId?'Document Conflict':'Sync Conflicts'}</h3><p>Nothing is overwritten automatically. Choose the correct result: keep this device's copy, use the server copy, or preserve both.</p>`;
  if(!items.length)body.innerHTML+='<p class="history-explainer">✓ No unresolved conflict remains for this document.</p>';
  for(const c of items){const row=document.createElement('div');row.className='sync-conflict';const title=c.local?.title||c.remote?.title||c.documentId;row.innerHTML=`<div><strong>${esc(title)}</strong><br><small>${esc(c.kind)} · server version ${c.serverVersion||'?'}</small></div><div class="conflict-actions"><button class="btn small keep-local">Keep local</button><button class="btn small use-server">Use server</button><button class="btn small save-both">Save both</button></div>`;
    row.querySelector('.keep-local').onclick=async()=>{if(!c.local)return;const d=clone(c.local);d.sync={status:'pending',baseServerVersion:Number(c.serverVersion||0),lastSyncedAt:null,lastError:null};await put('documents',d);await queueDocument(d);await del('conflicts',c.id);await syncNow({silent:true});resolveConflicts(documentId);emitDataChanged()};
    row.querySelector('.use-server').onclick=async()=>{if(c.remote){const d=migrateDocument(c.remote,currentUser.id);d.sync={status:'synced',baseServerVersion:Number(c.serverVersion||0),lastSyncedAt:now(),lastError:null};await put('documents',d)}else await del('documents',c.documentId);await del('conflicts',c.id);await del('syncQueue',`${currentUser.id}:${c.documentId}`);resolveConflicts(documentId);emitDataChanged()};
    row.querySelector('.save-both').onclick=async()=>{if(c.local){const copy=clone(c.local);copy.id=uid('doc');copy.title=(copy.title||'Document')+' — Conflict copy';decorateNewDocument(copy);await put('documents',copy);await queueDocument(copy)}if(c.remote){const d=migrateDocument(c.remote,currentUser.id);d.sync={status:'synced',baseServerVersion:Number(c.serverVersion||0),lastSyncedAt:now(),lastError:null};await put('documents',d)}await del('conflicts',c.id);await del('syncQueue',`${currentUser.id}:${c.documentId}`);resolveConflicts(documentId);emitDataChanged()};
    body.appendChild(row)
  }
  byId('modal').classList.remove('hidden');
}

async function exportWorkspaceBackup(){
  if(!currentUser)return;const docs=await ownedDocuments();const snaps=await ownedSnapshots();const templates=await ownedTemplates();const conflicts=(await all('conflicts')).filter(c=>c.ownerId===currentUser.id);const backup={format:'TeryaqWorkspaceBackup',backupVersion:'1.0.0',exportedAt:now(),appVersion:APP_VERSION,schemaVersion:DOCUMENT_SCHEMA_VERSION,account:{id:currentUser.id,email:currentUser.email,displayName:currentUser.displayName},documents:docs,snapshots:snaps,templates,conflicts};
  downloadJson(backup,`Teryaq_Workspace_${safe(currentUser.email)}_${new Date().toISOString().slice(0,10)}.teryaqbackup`)
}
function safe(s){return String(s||'workspace').replace(/[^a-z0-9_-]+/gi,'_').slice(0,80)}
function downloadJson(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(u);a.remove()},30000)}

async function restoreWorkspaceBackup(file){
  if(!currentUser)throw new Error('Sign in first');const data=JSON.parse(await file.text());if(data.format!=='TeryaqWorkspaceBackup')throw new Error('Not a Teryaq workspace backup');
  const currentDocs=await ownedDocuments();await put('migrationBackups',{id:uid('restore'),ownerId:currentUser.id,createdAt:now(),fromAppVersion:APP_VERSION,toAppVersion:APP_VERSION,documents:clone(currentDocs),reason:'Before workspace restore'});
  const overwrite=confirm('Restore backup into this account?\n\nOK = overwrite documents with matching IDs.\nCancel = import every document as a separate copy.');
  const idMap=new Map();
  for(let d of data.documents||[]){const oldId=d.id;d=decorateImportedDocument(d);if(!overwrite&&await get('documents',d.id)){d.id=uid('doc');d.title=(d.title||'Document')+' — Restored'}idMap.set(oldId,d.id);await put('documents',d);await queueDocument(d)}
  for(let t of data.templates||[]){t=clone(t);t.ownerId=currentUser.id;if(!overwrite&&await get('templates',t.id))t.id=uid('tpl');await put('templates',t)}
  for(let snap of data.snapshots||[]){snap=clone(snap);snap.id=uid('snap');snap.ownerId=currentUser.id;snap.documentId=idMap.get(snap.documentId)||snap.documentId;if(snap.document){snap.document.ownerId=currentUser.id;snap.document.id=snap.documentId}await put('snapshots',snap)}
  emitDataChanged();return (data.documents||[]).length
}

async function exportPreUpgradeBackups(){
  if(!currentUser)return;const rows=(await all('migrationBackups')).filter(x=>x.ownerId===currentUser.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));if(!rows.length)return alert('No local pre-upgrade backups exist for this account on this device.');downloadJson({format:'TeryaqMigrationBackups',exportedAt:now(),account:{id:currentUser.id,email:currentUser.email},backups:rows},`Teryaq_PreUpgrade_Backups_${safe(currentUser.email)}.json`)
}
async function removeLocalAccountData(){
  if(!currentUser)return;const email=currentUser.email;if(!confirm(`Remove all LOCAL data for ${email} from this device?

Synced cloud data is not deleted. Make sure pending changes are synced or backed up first.`))return;
  const stores=['documents','snapshots','templates','syncQueue','tombstones','conflicts','migrationBackups'];for(const store of stores){for(const x of await all(store)){if(x.ownerId===currentUser.id)await del(store,x.id)}}await del('accounts',currentUser.id);await signOut();location.reload()
}

async function showSettings(){
  const cfg=await getConfig();const deviceId=await getDeviceId();const last=await settingGet(LAST_SYNC_KEY);const autoSync=await getAutoSyncEnabled();const q=(await all('syncQueue')).filter(x=>x.ownerId===currentUser?.id);const c=await conflictCount();const body=byId('modalBody');
  body.innerHTML=`<h3>Account & Sync</h3><div class="settings-grid"><div><b>Signed in as</b><br>${esc(currentUser?.email||'')}</div><div><b>Role</b><br>${esc(currentUser?.role||'user')}</div><div><b>Device</b><br>${esc(deviceName())}</div><div><b>Device ID</b><br><code>${esc(deviceId)}</code></div><div><b>Last sync</b><br>${esc(last?new Date(last).toLocaleString():'Never')}</div><div><b>Pending / conflicts</b><br>${q.length} / ${c}</div></div><hr><h4>Automatic synchronization</h4><div class="field"><label><input id="autoSyncToggle" type="checkbox" ${autoSync?'checked':''}> Auto Sync whenever this device is online</label><p class="hint" id="autoSyncState">${autoSync?'On · syncs after saved changes and checks for remote updates every 30 seconds.':'Off · local changes wait until Sync Now is pressed.'}</p></div><hr><h4>Cloud connection</h4><div class="field"><label>Supabase project URL</label><input id="settingsProjectUrl" value="${esc(cfg.projectUrl)}" placeholder="https://xxxxx.supabase.co"></div><div class="field"><label>Supabase anon key</label><textarea id="settingsAnonKey" rows="3">${esc(cfg.anonKey)}</textarea></div><div class="modal-actions"><button class="btn primary" id="saveCloudConfig">Save connection</button><button class="btn" id="settingsSyncNow">Sync Now</button><button class="btn" id="settingsConflicts">Resolve Conflicts</button></div><hr><h4>Security</h4><div class="settings-grid"><div class="field"><label>New password</label><input id="newAccountPassword" type="password" autocomplete="new-password" minlength="8"></div><div class="field"><label>Confirm new password</label><input id="confirmAccountPassword" type="password" autocomplete="new-password" minlength="8"></div></div><div class="modal-actions"><button class="btn" id="changePasswordBtn">Change Password</button></div><p class="hint" id="changePasswordStatus">Use at least 8 characters. The change applies to this Supabase account on every device.</p><hr><h4>Backups</h4><div class="modal-actions"><button class="btn" id="workspaceBackup">Export Workspace Backup</button><button class="btn" id="workspaceRestore">Restore Workspace Backup</button><button class="btn" id="migrationBackupExport">Export Pre-Upgrade Backups</button><input id="workspaceRestoreFile" type="file" accept=".teryaqbackup,.json" hidden></div><hr><div class="modal-actions"><button class="btn danger" id="signOutBtn">Sign out</button><button class="btn danger" id="removeLocalDataBtn">Sign out & Remove Local Data</button></div><p class="hint">Signing out does not delete this account's local offline workspace. Use the device/browser storage controls if you intentionally want to erase local data.</p>`;
  byId('autoSyncToggle').onchange=async e=>{const enabled=await setAutoSyncEnabled(e.target.checked);byId('autoSyncState').textContent=enabled?'On · syncs after saved changes and checks for remote updates every 30 seconds.':'Off · local changes wait until Sync Now is pressed.'};byId('saveCloudConfig').onclick=async()=>{await saveConfig({projectUrl:byId('settingsProjectUrl').value,anonKey:byId('settingsAnonKey').value});alert('Cloud connection saved on this device.');scheduleAutoSync(0)};byId('settingsSyncNow').onclick=()=>syncNow();byId('settingsConflicts').onclick=()=>resolveConflicts();byId('changePasswordBtn').onclick=async()=>{const status=byId('changePasswordStatus');const password=byId('newAccountPassword').value;const confirmation=byId('confirmAccountPassword').value;status.textContent='';if(password!==confirmation){status.textContent='Passwords do not match.';return}const button=byId('changePasswordBtn');button.disabled=true;button.textContent='Changing…';try{await changePassword(password);byId('newAccountPassword').value='';byId('confirmAccountPassword').value='';status.textContent='Password changed successfully.'}catch(err){status.textContent=err.message}finally{button.disabled=false;button.textContent='Change Password'}};byId('workspaceBackup').onclick=()=>exportWorkspaceBackup();byId('workspaceRestore').onclick=()=>byId('workspaceRestoreFile').click();byId('migrationBackupExport').onclick=()=>exportPreUpgradeBackups();byId('workspaceRestoreFile').onchange=async e=>{if(e.target.files[0]){try{const n=await restoreWorkspaceBackup(e.target.files[0]);alert(`${n} document(s) restored.`)}catch(err){alert(err.message)}}};byId('signOutBtn').onclick=async()=>{await signOut();location.reload()};byId('removeLocalDataBtn').onclick=()=>removeLocalAccountData();byId('modal').classList.remove('hidden')
}

async function showAdminDashboard(){
  if(!isAdmin())return alert('Admin access required.');if(!isOnline())return alert('The admin dashboard needs an internet connection to show all users and synced files.');const body=byId('modalBody');body.innerHTML=`<h3>Welcome, ${esc(currentUser?.email||'Admin')}</h3><p>Loading Admin Dashboard…</p>`;byId('modal').classList.remove('hidden');
  try{const [profiles,docs]=await Promise.all([apiFetch('/rest/v1/profiles?select=id,email,display_name,role&order=email.asc'),apiFetch('/rest/v1/documents?select=id,owner_id,title,template_id,template_version,current_version,updated_at,deleted_at,document_json&order=updated_at.desc')]);const pmap=new Map((profiles||[]).map(p=>[p.id,p]));body.innerHTML=`<span class="eyebrow">Admin Dashboard</span><h3>Welcome, ${esc(currentUser?.email||'Admin')}</h3><p class="hint">Version is the sequential cloud snapshot number created after each accepted synchronization.</p><div class="admin-stats"><div><b>${profiles?.length||0}</b><span>Users</span></div><div><b>${(docs||[]).filter(d=>!d.deleted_at).length}</b><span>Synced documents</span></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>User</th><th>Document</th><th>Template</th><th>Version</th><th>Updated</th><th></th></tr></thead><tbody>${(docs||[]).map(d=>{const p=pmap.get(d.owner_id)||{};return `<tr><td>${esc(p.email||d.owner_id)}</td><td>${esc(d.title||d.id)}${d.deleted_at?' <em>(deleted)</em>':''}</td><td>${esc(d.template_id||'')}</td><td>${d.current_version||0}</td><td>${esc(new Date(d.updated_at).toLocaleString())}</td><td><div class="card-actions"><button class="btn small admin-download" data-id="${esc(d.id)}">Current</button><button class="btn small admin-versions" data-id="${esc(d.id)}">All versions</button></div></td></tr>`}).join('')}</tbody></table></div>`;body.querySelectorAll('.admin-versions').forEach(b=>b.onclick=()=>showAdminVersions(b.dataset.id));body.querySelectorAll('.admin-download').forEach(b=>b.onclick=()=>{const d=(docs||[]).find(x=>x.id===b.dataset.id);if(!d?.document_json)return alert('No document payload available.');downloadJson({format:'TeryaqPackage',packageVersion:'1.0.0',exportedAt:now(),appVersion:APP_VERSION,document:d.document_json},`${safe(d.title||d.id)}.teryaq`)})}catch(e){body.innerHTML=`<h3>Admin Dashboard</h3><div class="issue error">${esc(e.message)}</div>`}
}
async function showAdminVersions(documentId){try{const rows=await apiFetch(`/rest/v1/document_versions?document_id=eq.${encodeURIComponent(documentId)}&select=version,created_at,created_by,document_json,is_deleted&order=version.desc`);const body=byId('modalBody');body.innerHTML=`<h3>Document Versions</h3><p class="history-explainer">Each version is an immutable cloud snapshot created after a successful sync. Download one version or export the complete archive.</p><p><code>${esc(documentId)}</code></p><div class="modal-actions"><button class="btn primary" id="downloadAllVersions" ${rows?.length?'':'disabled'}>Download all versions</button><button class="btn" id="backAdmin">Back</button></div>${(rows||[]).map(v=>`<div class="snapshot-row"><div><b>Version ${v.version}${v.is_deleted?' · Deleted state':''}</b><br><small>${esc(new Date(v.created_at).toLocaleString())}</small></div><button class="btn small download-version" data-version="${v.version}" ${v.document_json?'':'disabled'}>Download</button></div>`).join('')||'<p>No historical versions yet.</p>'}`;byId('backAdmin').onclick=()=>showAdminDashboard();byId('downloadAllVersions').onclick=()=>downloadJson({format:'TeryaqVersionArchive',archiveVersion:'1.0.0',exportedAt:now(),appVersion:APP_VERSION,documentId,versions:rows},`${safe(documentId)}_all_versions.json`);body.querySelectorAll('.download-version').forEach(button=>button.onclick=()=>{const version=(rows||[]).find(v=>String(v.version)===button.dataset.version);if(version?.document_json)downloadJson({format:'TeryaqPackage',packageVersion:'1.0.0',exportedAt:now(),appVersion:APP_VERSION,cloudVersion:version.version,document:version.document_json},`${safe(version.document_json.title||documentId)}_v${version.version}.teryaq`)})}catch(e){alert(e.message)}}

async function initialize(){
  if(!db)throw new Error('Platform DB not attached');const cached=await restoreCachedSession();renderAuthGate();if(cached){hideAuthGate();await claimAndMigrateLegacyData();return {authenticated:true,user:cached}}return {authenticated:false}
}

function renderAuthGate(){
  const gate=byId('authGate');if(!gate)return;gate.classList.remove('hidden');const cfgInputs=()=>({projectUrl:byId('authProjectUrl')?.value,anonKey:byId('authAnonKey')?.value});
  getConfig().then(cfg=>{if(byId('authProjectUrl'))byId('authProjectUrl').value=cfg.projectUrl||'';if(byId('authAnonKey'))byId('authAnonKey').value=cfg.anonKey||''});
  byId('saveInitialCloudConfig').onclick=async()=>{const status=byId('initialCloudConfigStatus');status.textContent='';try{const saved=await saveConfig(cfgInputs());if(!configured(saved))throw new Error('Enter both the Supabase project URL and publishable key.');status.textContent='Connection saved on this device. You can sign in now.'}catch(e){status.textContent=e.message}};
  const cachedPromise=settingGet(AUTH_KEY);cachedPromise.then(async s=>{const offline=byId('continueOfflineBtn');if(s?.user?.id&&await get('accounts',s.user.id)){offline.classList.remove('hidden');offline.textContent=`Continue Offline as ${s.user.email||'cached user'}`}});
  byId('signInBtn').onclick=async()=>{const err=byId('authError');err.textContent='';try{await saveConfig(cfgInputs());byId('signInBtn').disabled=true;byId('signInBtn').textContent='Signing in…';await signIn(byId('authEmail').value.trim(),byId('authPassword').value);hideAuthGate();window.dispatchEvent(new CustomEvent('teryaq-authenticated'))}catch(e){err.textContent=e.message}finally{byId('signInBtn').disabled=false;byId('signInBtn').textContent='Sign in'}};
  byId('continueOfflineBtn').onclick=async()=>{try{await continueOffline();hideAuthGate();window.dispatchEvent(new CustomEvent('teryaq-authenticated'))}catch(e){byId('authError').textContent=e.message}};
}
function hideAuthGate(){byId('authGate')?.classList.add('hidden');byId('appShell')?.classList.remove('hidden');updateAccountUi();updateSyncUi();startAutoSync()}
function updateAccountUi(){const u=currentUser;if(byId('accountLabel'))byId('accountLabel').textContent=u?(u.displayName||u.email):'';if(byId('adminBtn'))byId('adminBtn').classList.toggle('hidden',!isAdmin())}

window.addEventListener('online',()=>{updateSyncUi();scheduleAutoSync(0)});window.addEventListener('offline',()=>{if(autoSyncTimeout){clearTimeout(autoSyncTimeout);autoSyncTimeout=null}updateSyncUi()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleAutoSync(0)});

window.TeryaqPlatform={
  APP_VERSION,DOCUMENT_SCHEMA_VERSION,PLATFORM_SCHEMA,attachDb,setDataChangedCallback,initialize,user,isAdmin,getConfig,saveConfig,getAutoSyncEnabled,setAutoSyncEnabled,startAutoSync,stopAutoSync,scheduleAutoSync,signIn,signOut,changePassword,continueOffline,getDeviceId,decorateNewDocument,decorateImportedDocument,markDocumentPending,queueDocument,queueDelete,ownedDocuments,ownedTemplates,ownedSnapshots,syncNow,updateSyncUi,resolveConflicts,showSettings,showAdminDashboard,exportWorkspaceBackup,restoreWorkspaceBackup,migrateDocument,claimAndMigrateLegacyData
};
})();
