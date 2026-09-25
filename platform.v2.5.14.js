/* TERYAQ Master Tool Platform v2.5.14
   Account isolation, offline authentication cache, device registration,
   sync queue, conflict handling, workspace backups, admin read dashboard,
   and safe local-data migrations. No service-role key is ever used client-side. */
(() => {
'use strict';

const APP_VERSION='2.5.14';
const DOCUMENT_SCHEMA_VERSION='2.0.0';
const PLATFORM_SCHEMA=4;
const DEVICE_KEY='deviceId';
const AUTH_KEY='authSession';
const CONFIG_KEY='cloudConfig';
const LAST_SYNC_KEY='lastSyncAt';
const AUTO_SYNC_KEY='autoSyncEnabled';
const CONTENT_OPTIONS_CACHE_KEY='contentOptionsCache';
const APP_UPDATES_CACHE_KEY='appUpdatesCache';
const LAST_SYNC_ATTEMPT_KEY='lastSyncAttemptAt';
const LAST_SYNC_ERROR_KEY='lastSyncError';
const AUTO_SYNC_INTERVAL_MS=15000;
const AUTO_SYNC_DEBOUNCE_MS=700;
let db=null;
let currentUser=null;
let session=null;
let dataChangedCb=null;
let syncRunning=false;
let syncPromise=null;
let autoSyncInterval=null;
let autoSyncTimeout=null;
let retryDelayMs=2000;

const $=s=>document.querySelector(s);
const byId=id=>document.getElementById(id);
const now=()=>new Date().toISOString();
const clone=o=>JSON.parse(JSON.stringify(o));
const uid=(p='id')=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PASSWORD_EYE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>';
const PASSWORD_EYE_OFF='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.4 3.1M6.1 6.1C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6c1.4 0 2.7-.3 3.8-.8M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function passwordToggleMarkup(id){return `<button class="password-toggle" id="${id}" type="button" aria-label="Show password" aria-pressed="false" title="Show password">${PASSWORD_EYE}</button>`}
function bindPasswordToggle(buttonId,inputId){const button=byId(buttonId),input=byId(inputId);if(!button||!input)return;button.onclick=()=>{const show=input.type==='password';input.type=show?'text':'password';button.innerHTML=show?PASSWORD_EYE_OFF:PASSWORD_EYE;button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',show?'Hide password':'Show password');button.title=show?'Hide password':'Show password'}}

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
function inviteSessionFromUrl(){
  const params=new URLSearchParams(String(location.hash||'').replace(/^#/,''));
  if(params.get('type')!=='invite'||!params.get('access_token'))return null;
  return {accessToken:params.get('access_token'),refreshToken:params.get('refresh_token')||'',tokenType:params.get('token_type')||'bearer',expiresIn:Number(params.get('expires_in')||3600)}
}
async function activateOwnAccountRequest(){try{await apiFetch('/rest/v1/rpc/activate_own_account_request',{method:'POST',body:{}})}catch(error){console.warn('Account request activation:',error.message)}}
async function completeInvitePassword(invite,password){
  if(!invite?.accessToken)throw new Error('The invitation link is incomplete or expired.');
  if(String(password||'').length<8)throw new Error('Password must be at least 8 characters.');
  const authorization=`Bearer ${invite.accessToken}`,updated=await apiFetch('/auth/v1/user',{method:'PUT',body:{password},auth:false,headers:{Authorization:authorization}}),authUser=updated?.user||updated,expiresAt=Math.floor(Date.now()/1000)+Math.max(60,Number(invite.expiresIn||3600));
  session={access_token:invite.accessToken,refresh_token:invite.refreshToken,token_type:invite.tokenType,expires_in:invite.expiresIn,expires_at:expiresAt,user:authUser};await settingPut(AUTH_KEY,session);
  let profile=null;try{const rows=await apiFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,email,display_name,role,avatar_path`);profile=Array.isArray(rows)?rows[0]:null}catch{}
  currentUser={id:authUser.id,email:authUser.email||'',displayName:profile?.display_name||authUser.user_metadata?.name||'',role:profile?.role||'user',avatarPath:profile?.avatar_path||'',lastAuthenticatedAt:now()};await put('accounts',currentUser);await activateOwnAccountRequest();await registerDevice();await claimAndMigrateLegacyData();await reconcileTrashedConflicts();history.replaceState(null,document.title,location.pathname+location.search);return currentUser
}
async function submitAccountRequest(request){
  const payload={p_name:String(request.name||'').trim(),p_email:String(request.email||'').trim(),p_executor_type:'Team member',p_note:String(request.note||'').trim()};
  return apiFetch('/rest/v1/rpc/submit_account_request',{method:'POST',body:payload,auth:false})
}
async function decideAccountRequest(requestId,action,decisionNote=''){
  if(!isAdmin())throw new Error('Admin access required.');
  try{return await apiFetch('/functions/v1/admin-account-request',{method:'POST',body:{request_id:requestId,action,decision_note:decisionNote}})}catch(error){
    if(error instanceof TypeError||/failed to fetch|networkerror|load failed/i.test(String(error?.message||error)))throw new Error('The account approval service is not reachable. Deploy the Supabase Edge Function “admin-account-request”, then try Approve & Invite again.');
    throw error
  }
}
async function recordAdminEvent(eventType,entityType,entityId=null,ownerId=null,metadata={}){
  if(!isAdmin()||!isOnline())return;
  try{await apiFetch('/rest/v1/rpc/record_admin_event',{method:'POST',body:{p_event_type:eventType,p_entity_type:entityType,p_entity_id:entityId,p_owner_id:ownerId,p_metadata:metadata}})}catch(error){console.warn('Admin audit event:',error.message)}
}
function emptyContentOptions(){return {subjects:[],authors:[],chapters:[],loadedAt:null}}
function normalizedContentOptions(value){const source=value||{};return {subjects:Array.isArray(source.subjects)?source.subjects:[],authors:Array.isArray(source.authors)?source.authors:[],chapters:Array.isArray(source.chapters)?source.chapters:[],loadedAt:source.loadedAt||null}}
async function getContentOptions({force=false,strict=false}={}){
  const cached=normalizedContentOptions(await settingGet(CONTENT_OPTIONS_CACHE_KEY));if(!currentUser||!isOnline())return cached;
  if(!force&&cached.loadedAt&&Date.now()-Date.parse(cached.loadedAt)<15000)return cached;
  try{
    const activeFilter=isAdmin()?'':'&active=eq.true',[subjects,authors,chapters]=await Promise.all([
      apiFetch(`/rest/v1/content_subjects?select=id,name,active,sort_order,created_at,updated_at${activeFilter}&order=sort_order.asc,name.asc`),
      apiFetch(`/rest/v1/content_authors?select=id,name,active,sort_order,created_at,updated_at${activeFilter}&order=sort_order.asc,name.asc`),
      apiFetch(`/rest/v1/content_chapters?select=id,subject_id,chapter_number,title,active,sort_order,created_at,updated_at${activeFilter}&order=sort_order.asc,chapter_number.asc`)
    ]),result={subjects:subjects||[],authors:authors||[],chapters:chapters||[],loadedAt:now()};await settingPut(CONTENT_OPTIONS_CACHE_KEY,result);window.dispatchEvent(new CustomEvent('teryaq-content-options-updated',{detail:clone(result)}));return result
  }catch(error){console.warn('Content options refresh:',error.message);if(strict)throw new Error(`Content Options database is not ready: ${error.message}. Run migration 009_content_options_repair_course_hierarchy.sql in Supabase, then press Refresh.`);return cached}
}
async function getAutoSyncEnabled(){if((await settingGet(AUTO_SYNC_KEY))!==true)await settingPut(AUTO_SYNC_KEY,true);return true}
async function setAutoSyncEnabled(enabled){
  await settingPut(AUTO_SYNC_KEY,true);startAutoSync();scheduleAutoSync(0);await updateSyncUi();return true
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
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);let resp;try{resp=await fetch(`${cfg.projectUrl}${path}`,{method,headers:h,body:body==null?undefined:JSON.stringify(body),signal:controller.signal})}catch(error){if(error.name==='AbortError')throw new Error('Cloud request timed out. The change remains queued and will retry.');throw error}finally{clearTimeout(timeout)}
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
  try{const rows=await apiFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,email,display_name,role,avatar_path`);profile=Array.isArray(rows)?rows[0]:null}catch{}
  currentUser={id:authUser.id,email:authUser.email||email,displayName:profile?.display_name||authUser.user_metadata?.name||'',role:profile?.role||'user',avatarPath:profile?.avatar_path||'',lastAuthenticatedAt:now()};
  await put('accounts',currentUser);
  await activateOwnAccountRequest();
  await registerDevice();
  await claimAndMigrateLegacyData();
  await reconcileTrashedConflicts();
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
    try{await ensureSessionFresh();const rows=await apiFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=id,email,display_name,role,avatar_path`);const p=Array.isArray(rows)?rows[0]:null;currentUser={...cached,email:p?.email||cached.email,displayName:p?.display_name||cached.displayName,role:p?.role||cached.role||'user',avatarPath:p?.avatar_path||cached.avatarPath||''};await put('accounts',currentUser);await registerDevice();return currentUser}catch(e){console.warn('Online session validation failed:',e.message);return null}
  }
  currentUser=cached;return currentUser;
}

async function continueOffline(){
  session=await settingGet(AUTH_KEY);if(!session?.user?.id)throw new Error('No previously authenticated account is available offline.');
  const cached=await get('accounts',session.user.id);if(!cached)throw new Error('No local account cache exists.');currentUser=cached;await reconcileTrashedConflicts();return cached;
}

async function signOut(){stopAutoSync();session=null;currentUser=null;await settingPut(AUTH_KEY,null)}

async function changePassword(newPassword){
  const password=String(newPassword||'');
  if(password.length<8)throw new Error('Password must be at least 8 characters.');
  if(!currentUser)throw new Error('Sign in first.');
  await apiFetch('/auth/v1/user',{method:'PUT',body:{password}});
  return true
}

async function updateDisplayName(value){
  const displayName=String(value||'').trim();if(displayName.length<2||displayName.length>80)throw new Error('Username must be between 2 and 80 characters.');if(!currentUser)throw new Error('Sign in first.');
  await apiFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(currentUser.id)}`,{method:'PATCH',body:{display_name:displayName},headers:{'Prefer':'return=minimal'}});currentUser.displayName=displayName;await put('accounts',currentUser);updateAccountUi();emitDataChanged();return displayName
}
function fileDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)})}
function dataUrlBlob(dataUrl){const [head,data]=String(dataUrl).split(','),type=/data:([^;]+)/.exec(head)?.[1]||'application/octet-stream',bytes=atob(data),array=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)array[i]=bytes.charCodeAt(i);return new Blob([array],{type})}
function encodedStoragePath(path){return String(path||'').split('/').map(encodeURIComponent).join('/')}
async function storageFetch(path,{method='GET',body=null,headers={}}={}){const cfg=await getConfig();if(!configured(cfg))throw new Error('Cloud connection is not configured on this device.');if(!isOnline())throw new Error('Offline');await ensureSessionFresh();const response=await fetch(`${cfg.projectUrl}${path}`,{method,body,headers:{apikey:cfg.anonKey,Authorization:`Bearer ${session.access_token}`,...headers}});if(!response.ok){let message=`HTTP ${response.status}`;try{const json=await response.json();message=json.message||json.error||message}catch{}throw new Error(message)}return response}
async function uploadPendingAvatar(){
  if(!currentUser||!isOnline())return false;if(await settingGet(`pendingAvatarRemoval:${currentUser.id}`)){await apiFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(currentUser.id)}`,{method:'PATCH',body:{avatar_path:null},headers:{Prefer:'return=minimal'}});await settingPut(`pendingAvatarRemoval:${currentUser.id}`,null);currentUser.avatarPath='';await put('accounts',currentUser)}const pending=await settingGet(`pendingAvatar:${currentUser.id}`);if(!pending?.dataUrl)return false;const blob=dataUrlBlob(pending.dataUrl),extension=(pending.name?.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase()||'jpg',path=`${currentUser.id}/profile/avatar.${extension}`;
  await storageFetch(`/storage/v1/object/teryaq-author/${encodedStoragePath(path)}`,{method:'POST',body:blob,headers:{'Content-Type':blob.type||'image/png','x-upsert':'true'}});await apiFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(currentUser.id)}`,{method:'PATCH',body:{avatar_path:path},headers:{Prefer:'return=minimal'}});currentUser.avatarPath=path;await put('accounts',currentUser);await settingPut(`pendingAvatar:${currentUser.id}`,null);updateAccountUi();return true
}
async function updateProfileAvatar(file){
  if(!currentUser)throw new Error('Sign in first.');if(!file?.type?.startsWith('image/'))throw new Error('Choose an image file.');if(file.size>5*1024*1024)throw new Error('Profile image must be 5 MB or smaller.');const normalized=await cropAvatarSquare(file),dataUrl=await fileDataUrl(normalized);await settingPut(`profileAvatar:${currentUser.id}`,dataUrl);await settingPut(`pendingAvatarRemoval:${currentUser.id}`,null);await settingPut(`pendingAvatar:${currentUser.id}`,{dataUrl,name:'avatar.jpg',type:normalized.type,size:normalized.size,queuedAt:now()});updateAccountUi();if(isOnline())await uploadPendingAvatar();return dataUrl
}
async function cropAvatarSquare(file){try{const image=await createImageBitmap(file),side=Math.min(image.width,image.height),sx=(image.width-side)/2,sy=(image.height-side)/2,canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;canvas.getContext('2d',{alpha:false}).drawImage(image,sx,sy,side,side,0,0,512,512);image.close?.();return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Photo crop failed.')),'image/jpeg',.9))}catch(error){console.warn('Automatic avatar crop unavailable:',error);return file}}
async function removeProfileAvatar(){if(!currentUser)return;await settingPut(`profileAvatar:${currentUser.id}`,null);await settingPut(`pendingAvatar:${currentUser.id}`,null);currentUser.avatarPath='';await put('accounts',currentUser);if(isOnline()){await apiFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(currentUser.id)}`,{method:'PATCH',body:{avatar_path:null},headers:{Prefer:'return=minimal'}});await settingPut(`pendingAvatarRemoval:${currentUser.id}`,null)}else await settingPut(`pendingAvatarRemoval:${currentUser.id}`,true);updateAccountUi()}
async function profileAvatarSource(){
  if(!currentUser)return 'icons/default-avatar.svg';const local=await settingGet(`profileAvatar:${currentUser.id}`);if(local)return local;if(!currentUser.avatarPath||!isOnline())return 'icons/default-avatar.svg';try{const response=await storageFetch(`/storage/v1/object/authenticated/teryaq-author/${encodedStoragePath(currentUser.avatarPath)}`),dataUrl=await fileDataUrl(await response.blob());await settingPut(`profileAvatar:${currentUser.id}`,dataUrl);return dataUrl}catch(error){console.warn('Avatar download:',error.message);return 'icons/default-avatar.svg'}
}

async function getUpdates({force=false}={}){
  if(!currentUser)return {items:[],unreadIds:[]};const cacheKey=`${APP_UPDATES_CACHE_KEY}:${currentUser.id}`,cached=await settingGet(cacheKey)||{items:[],readIds:[],loadedAt:null};if(!isOnline()||(!force&&cached.loadedAt&&Date.now()-Date.parse(cached.loadedAt)<15000))return {items:cached.items||[],unreadIds:(cached.items||[]).filter(item=>!(cached.readIds||[]).includes(item.id)).map(item=>item.id)};
  try{if(cached.pendingReadIds?.length)await apiFetch('/rest/v1/app_update_reads?on_conflict=update_id,user_id',{method:'POST',body:cached.pendingReadIds.map(id=>({update_id:id,user_id:currentUser.id,read_at:now()})),headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});const [items,reads]=await Promise.all([apiFetch('/rest/v1/app_updates?select=id,title,body,created_by,created_at&order=created_at.desc&limit=50'),apiFetch(`/rest/v1/app_update_reads?user_id=eq.${encodeURIComponent(currentUser.id)}&select=update_id`)]),value={items:items||[],readIds:(reads||[]).map(row=>row.update_id),pendingReadIds:[],loadedAt:now()};await settingPut(cacheKey,value);return {items:value.items,unreadIds:value.items.filter(item=>!value.readIds.includes(item.id)).map(item=>item.id)}}catch(error){console.warn('Updates refresh:',error.message);return {items:cached.items||[],unreadIds:(cached.items||[]).filter(item=>!(cached.readIds||[]).includes(item.id)).map(item=>item.id)}}
}
async function markAllUpdatesRead(){if(!currentUser)return;const result=await getUpdates(),rows=result.items.map(item=>({update_id:item.id,user_id:currentUser.id,read_at:now()})),cacheKey=`${APP_UPDATES_CACHE_KEY}:${currentUser.id}`,cached=await settingGet(cacheKey)||{};if(rows.length&&isOnline())await apiFetch('/rest/v1/app_update_reads?on_conflict=update_id,user_id',{method:'POST',body:rows,headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});cached.readIds=result.items.map(item=>item.id);cached.pendingReadIds=isOnline()?[]:cached.readIds;cached.loadedAt=now();await settingPut(cacheKey,cached)}
async function markUpdateRead(id){
  if(!currentUser||!id)return false;
  const cacheKey=`${APP_UPDATES_CACHE_KEY}:${currentUser.id}`,cached=await settingGet(cacheKey)||{};
  cached.readIds=[...new Set([...(cached.readIds||[]),id])];
  cached.pendingReadIds=[...new Set([...(cached.pendingReadIds||[]),id])];
  cached.loadedAt=now();await settingPut(cacheKey,cached);
  if(isOnline())try{
    await apiFetch('/rest/v1/app_update_reads?on_conflict=update_id,user_id',{method:'POST',body:[{update_id:id,user_id:currentUser.id,read_at:now()}],headers:{Prefer:'resolution=merge-duplicates,return=minimal'}});
    const latest=await settingGet(cacheKey)||cached;latest.pendingReadIds=(latest.pendingReadIds||[]).filter(pendingId=>pendingId!==id);await settingPut(cacheKey,latest);
  }catch(error){console.warn('Update read will sync later:',error.message)}
  return true;
}
async function createAppUpdate(title,body){if(!isAdmin())throw new Error('Admin access required.');const cleanTitle=String(title||'').trim(),cleanBody=String(body||'').trim();if(!cleanTitle||!cleanBody)throw new Error('Title and message are required.');await apiFetch('/rest/v1/app_updates',{method:'POST',body:{title:cleanTitle,body:cleanBody,created_by:currentUser.id},headers:{Prefer:'return=minimal'}});await settingPut(`${APP_UPDATES_CACHE_KEY}:${currentUser.id}`,null);return true}
async function deleteAppUpdate(id){if(!isAdmin())throw new Error('Admin access required.');await apiFetch(`/rest/v1/app_updates?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'});await settingPut(`${APP_UPDATES_CACHE_KEY}:${currentUser.id}`,null);return true}

async function registerDevice(){
  if(!currentUser||!isOnline())return;
  const id=await getDeviceId();const rec={id,user_id:currentUser.id,device_name:deviceName(),platform:platformName(),app_version:APP_VERSION,last_seen_at:now()};
  try{await apiFetch('/rest/v1/devices?on_conflict=id',{method:'POST',body:rec,headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}})}catch(e){console.warn('Device registration:',e.message)}
  await put('devices',{id,ownerId:currentUser.id,...rec});
}
function base64Metadata(value){const bytes=new TextEncoder().encode(String(value||''));let binary='';bytes.forEach(byte=>binary+=String.fromCharCode(byte));return btoa(binary)}
function mediaProgress(record){window.dispatchEvent(new CustomEvent('teryaq-media-progress',{detail:{id:record.id,documentId:record.documentId,figureId:record.figureId,status:record.status,size:Number(record.size||0),uploadedBytes:Number(record.uploadedBytes||0),speed:Number(record.speed||0),eta:Number(record.eta||0),storagePath:record.storagePath||''}}))}
async function saveMediaProgress(record){record.updatedAt=now();await put('mediaQueue',record);mediaProgress(record);return record}
async function createTusUpload(record){
  const cfg=await getConfig();await ensureSessionFresh();const metadata=[['bucketName','teryaq-author'],['objectName',record.storagePath],['contentType',record.contentType||'application/octet-stream'],['cacheControl','3600'],['filename',record.fileName||'image']].map(([key,value])=>`${key} ${base64Metadata(value)}`).join(','),response=await fetch(`${cfg.projectUrl}/storage/v1/upload/resumable`,{method:'POST',headers:{apikey:cfg.anonKey,Authorization:`Bearer ${session.access_token}`,'Tus-Resumable':'1.0.0','Upload-Length':String(record.size),'Upload-Metadata':metadata,'x-upsert':'true'}});if(!response.ok)throw new Error(`Could not start image upload (HTTP ${response.status}).`);const location=response.headers.get('Location');if(!location)throw new Error('The storage server did not return a resumable upload URL.');return new URL(location,cfg.projectUrl).href
}
async function tusOffset(url){const cfg=await getConfig();await ensureSessionFresh();const response=await fetch(url,{method:'HEAD',headers:{apikey:cfg.anonKey,Authorization:`Bearer ${session.access_token}`,'Tus-Resumable':'1.0.0'}});if(!response.ok)throw new Error(`Could not resume image upload (HTTP ${response.status}).`);return Number(response.headers.get('Upload-Offset')||0)}
async function tusPatch(url,blob,offset,record,startedAt){
  const cfg=await getConfig();await ensureSessionFresh();return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PATCH',url);xhr.setRequestHeader('apikey',cfg.anonKey);xhr.setRequestHeader('Authorization',`Bearer ${session.access_token}`);xhr.setRequestHeader('Tus-Resumable','1.0.0');xhr.setRequestHeader('Upload-Offset',String(offset));xhr.setRequestHeader('Content-Type','application/offset+octet-stream');xhr.upload.onprogress=event=>{if(!event.lengthComputable)return;const uploaded=Math.min(record.size,offset+event.loaded),seconds=Math.max(.2,(Date.now()-startedAt)/1000),speed=Math.max(1,(uploaded-Number(record.resumeStartOffset||0))/seconds);record.uploadedBytes=uploaded;record.speed=speed;record.eta=Math.max(0,(record.size-uploaded)/speed);mediaProgress(record)};xhr.onerror=()=>reject(new Error('Image upload connection failed.'));xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve(Number(xhr.getResponseHeader('Upload-Offset')||offset+blob.size)):reject(new Error(`Image upload failed (HTTP ${xhr.status}).`));xhr.send(blob)})
}
async function uploadMediaRecord(record){
  if(!record.file)throw new Error('The local image file is unavailable. Choose it again.');const safeName=String(record.fileName||'image').replace(/[^a-z0-9._-]+/gi,'_'),path=`${currentUser.id}/${record.documentId}/${record.id}/${safeName}`;record.storagePath=record.storagePath||path;record.status='uploading';record.resumeStartOffset=Number(record.uploadedBytes||0);await saveMediaProgress(record);let offset=Number(record.uploadedBytes||0);
  if(record.tusUrl){try{offset=await tusOffset(record.tusUrl)}catch{record.tusUrl='';offset=0}}if(!record.tusUrl){record.tusUrl=await createTusUpload(record);offset=0;await saveMediaProgress(record)}record.uploadedBytes=offset;const startedAt=Date.now(),chunkSize=6*1024*1024;while(offset<record.size){if(!isOnline())throw new Error('Offline');const chunk=record.file.slice(offset,Math.min(record.size,offset+chunkSize));offset=await tusPatch(record.tusUrl,chunk,offset,record,startedAt);record.uploadedBytes=offset;await saveMediaProgress(record)}
  try{await apiFetch('/rest/v1/attachments',{method:'POST',body:{id:record.id,document_id:record.documentId,owner_id:currentUser.id,storage_path:record.storagePath,filename:record.fileName,mime_type:record.contentType,size_bytes:record.size},headers:{Prefer:'return=minimal'}})}catch(error){if(!/duplicate|already exists|409/i.test(error.message))throw error}record.status='uploaded';record.uploadedBytes=record.size;record.eta=0;await saveMediaProgress(record);const document=await get('documents',record.documentId),figure=document?.content?.figures?.find(item=>item.id===record.figureId);if(figure){Object.assign(figure,{attachmentId:record.id,storagePath:record.storagePath,imageStatus:'uploaded',uploadedBytes:record.size,imageSize:record.size,uploadSpeed:record.speed,uploadEta:0});markDocumentPending(document);await put('documents',document);await queueDocument(document)}return record
}
async function processMediaQueue(){
  if(!currentUser)return;const records=(await all('mediaQueue')).filter(record=>record.ownerId===currentUser.id&&record.status!=='uploaded').sort((a,b)=>String(a.queuedAt).localeCompare(String(b.queuedAt)));for(const record of records){if(!isOnline()){record.status='paused-offline';await saveMediaProgress(record);continue}try{await uploadMediaRecord(record)}catch(error){record.status=isOnline()?'failed':'paused-offline';record.error=error.message;await saveMediaProgress(record);if(isOnline())console.warn('Figure image upload:',error.message)}}
}
async function getAttachmentPreview(storagePath){if(!storagePath)return '';const key=`attachmentPreview:${currentUser?.id}:${storagePath}`,cached=await get('appCache',key);if(cached?.dataUrl)return cached.dataUrl;if(!isOnline())return '';const response=await storageFetch(`/storage/v1/object/authenticated/teryaq-author/${encodedStoragePath(storagePath)}`),dataUrl=await fileDataUrl(await response.blob());await put('appCache',{key,dataUrl,updatedAt:now()});return dataUrl}

async function reportCloudConflict(conflict){
  if(!currentUser||!isOnline()||!conflict?.documentId)return;
  try{
    const deviceId=await getDeviceId(),localVersion=Number(conflict.local?.sync?.baseServerVersion||0);
    await apiFetch('/rest/v1/rpc/report_sync_conflict',{method:'POST',body:{p_document_id:conflict.documentId,p_device_id:deviceId,p_conflict_type:conflict.kind||'edit',p_local_base_version:localVersion,p_server_version:Number(conflict.serverVersion||0),p_metadata:{detected_at:conflict.createdAt||now(),app_version:APP_VERSION}}})
  }catch(error){console.warn('Cloud conflict metadata:',error.message)}
}
async function resolveCloudConflict(documentId,resolution){
  if(!currentUser||!isOnline()||!documentId)return;
  try{await apiFetch('/rest/v1/rpc/resolve_sync_conflict',{method:'POST',body:{p_document_id:documentId,p_device_id:await getDeviceId(),p_resolution:resolution}})}catch(error){console.warn('Cloud conflict resolution:',error.message)}
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
async function queueEmbeddedFigureImages(doc){for(const figure of doc?.content?.figures||[]){if(!String(figure.image||'').startsWith('data:')||figure.storagePath)continue;const id=figure.attachmentId||`att_${doc.id}_${figure.id}`,existing=await get('mediaQueue',id);if(existing)continue;const file=dataUrlBlob(figure.image);await put('mediaQueue',{id,ownerId:currentUser.id,documentId:doc.id,figureId:figure.id,file,fileName:figure.imageName||`${figure.code||figure.id}.png`,contentType:file.type||'image/png',size:file.size,status:isOnline()?'waiting':'paused-offline',uploadedBytes:0,tusUrl:'',storagePath:'',queuedAt:now(),updatedAt:now()})}}
async function queueDocument(doc){if(!doc||!currentUser)return;await queueEmbeddedFigureImages(doc);markDocumentPending(doc);if(doc.sync.status==='conflict'){updateSyncUi();return}await put('syncQueue',{id:`${currentUser.id}:${doc.id}`,ownerId:currentUser.id,documentId:doc.id,operation:'upsert',queuedAt:now()});updateSyncUi();scheduleAutoSync()}
async function queueDelete(doc){if(!doc||!currentUser)return;const id=`${currentUser.id}:${doc.id}`,deletedAt=now(),conflict=await get('conflicts',id),baseServerVersion=Math.max(Number(doc.sync?.baseServerVersion||0),Number(conflict?.serverVersion||0));await put('trash',{id,ownerId:currentUser.id,documentId:doc.id,document:clone(doc),deletedAt,title:doc.title||'',baseServerVersion,cloudSynced:false,hadConflict:Boolean(conflict||doc.sync?.status==='conflict'),conflictSnapshot:conflict?clone(conflict):null});await put('tombstones',{id,ownerId:currentUser.id,documentId:doc.id,baseServerVersion,deletedAt,title:doc.title||''});await put('syncQueue',{id,ownerId:currentUser.id,documentId:doc.id,operation:'delete',queuedAt:now()});await del('conflicts',id);await del('documents',doc.id);updateSyncUi();emitDataChanged();scheduleAutoSync()}

async function ownedDocuments(){if(!currentUser)return[];return (await all('documents')).filter(d=>d.ownerId===currentUser.id)}
async function ownedTemplates(){if(!currentUser)return[];return (await all('templates')).filter(t=>t.ownerId===currentUser.id)}
async function ownedSnapshots(){if(!currentUser)return[];return (await all('snapshots')).filter(s=>s.ownerId===currentUser.id)}
async function ownedTrash(){if(!currentUser)return[];return (await all('trash')).filter(s=>s.ownerId===currentUser.id).sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)))}
async function reconcileTrashedConflicts(){if(!currentUser)return 0;const [docs,items,conflicts]=await Promise.all([ownedDocuments(),ownedTrash(),all('conflicts')]),activeIds=new Set(docs.map(d=>d.id)),trashByDocument=new Map(items.map(item=>[item.documentId,item]));let moved=0;for(const conflict of conflicts){if(conflict.ownerId!==currentUser.id||activeIds.has(conflict.documentId))continue;const item=trashByDocument.get(conflict.documentId);if(!item)continue;item.hadConflict=true;item.conflictSnapshot=clone(conflict);item.baseServerVersion=Math.max(Number(item.baseServerVersion||0),Number(conflict.serverVersion||0));await put('trash',item);await del('conflicts',conflict.id);moved++}if(moved)await updateSyncUi();return moved}
async function restoreTrashItem(id){
  if(!currentUser)return;const item=await get('trash',id);if(!item||item.ownerId!==currentUser.id)throw new Error('Deleted document not found.');let doc=clone(item.document);doc=migrateDocument(doc,currentUser.id);doc.ownerId=currentUser.id;doc.updatedAt=now();const restoreConflict=Boolean(item.hadConflict||item.conflictSnapshot),serverVersion=Math.max(Number(item.baseServerVersion||0),Number(item.conflictSnapshot?.serverVersion||0));doc.sync={status:restoreConflict?'conflict':'pending',baseServerVersion:serverVersion,lastSyncedAt:null,lastError:restoreConflict?'This restored document still needs its previous conflict resolved.':null};await put('documents',doc);await del('trash',id);await del('tombstones',id);await del('syncQueue',id);if(restoreConflict){const saved=item.cloudSynced?{id,ownerId:currentUser.id,documentId:doc.id,createdAt:now(),kind:'restore-after-delete',local:clone(doc),remote:null,serverVersion}:{...(item.conflictSnapshot||{}),id,ownerId:currentUser.id,documentId:doc.id,createdAt:now(),kind:item.conflictSnapshot?.kind||'restored-conflict',local:clone(doc),serverVersion};await put('conflicts',saved);await updateSyncUi()}else await queueDocument(doc);emitDataChanged();if(!restoreConflict)scheduleAutoSync(0);return doc
}

async function repairDocumentIdentity(doc,item){
  const oldId=doc.id,repaired=clone(doc),repairedAt=now();
  repaired.id=uid('doc');repaired.ownerId=currentUser.id;repaired.updatedAt=repairedAt;repaired.identityRepairedFrom=oldId;repaired.identityRepairedAt=repairedAt;decorateNewDocument(repaired);
  await put('migrationBackups',{id:uid('ownership-repair'),ownerId:currentUser.id,createdAt:repairedAt,fromAppVersion:APP_VERSION,toAppVersion:APP_VERSION,documents:[clone(doc)],reason:'Automatic backup before document identity repair'});
  await put('documents',repaired);
  const snapshots=(await all('snapshots')).filter(s=>s.ownerId===currentUser.id&&s.documentId===oldId);
  for(const snapshot of snapshots){snapshot.documentId=repaired.id;if(snapshot.document){snapshot.document.id=repaired.id;snapshot.document.ownerId=currentUser.id}await put('snapshots',snapshot)}
  await queueDocument(repaired);await del('syncQueue',item.id);await del('documents',oldId);
  window.dispatchEvent(new CustomEvent('teryaq-document-rekeyed',{detail:{oldId,document:clone(repaired)}}));
  return repaired
}

function sameLocalRevision(sent,latest){
  const sentToken=String(sent?.localSaveToken||''),latestToken=String(latest?.localSaveToken||'');
  if(sentToken||latestToken)return Boolean(sentToken&&latestToken&&sentToken===latestToken);
  return String(sent?.localSavedAt||sent?.updatedAt||'')===String(latest?.localSavedAt||latest?.updatedAt||'')
}
function emitDocumentSyncMetadata(document){
  if(!document?.id)return;
  window.dispatchEvent(new CustomEvent('teryaq-document-sync-metadata',{detail:{documentId:document.id,localSaveToken:document.localSaveToken||null,sync:clone(document.sync||{})}}))
}
function reconcileSuccessfulPush(sent,item,serverVersion){
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(['documents','syncQueue'],'readwrite'),documents=transaction.objectStore('documents'),queue=transaction.objectStore('syncQueue');let outcome=null,failure=null;
    const request=documents.get(sent.id);
    request.onsuccess=()=>{try{
      const latest=request.result;
      if(!latest){queue.delete(item.id);outcome={status:'missing',document:null,newerLocal:false};return}
      const newerLocal=!sameLocalRevision(sent,latest),syncedAt=now();
      latest.sync={...(latest.sync||{}),status:newerLocal?'pending':'synced',baseServerVersion:Number(serverVersion||latest.sync?.baseServerVersion||1),lastSyncedAt:syncedAt,lastError:null};
      documents.put(latest);
      if(newerLocal)queue.put({id:item.id,ownerId:item.ownerId,documentId:item.documentId,operation:'upsert',queuedAt:syncedAt});else queue.delete(item.id);
      outcome={status:newerLocal?'newer-local-pending':'synced',document:clone(latest),newerLocal}
    }catch(error){failure=error;transaction.abort()}};
    transaction.oncomplete=()=>resolve(outcome);transaction.onerror=()=>reject(failure||transaction.error);transaction.onabort=()=>reject(failure||transaction.error||new Error('Push reconciliation transaction aborted'))
  })
}
function recordEditConflict(sent,item,result){
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(['documents','conflicts','syncQueue'],'readwrite'),documents=transaction.objectStore('documents'),conflicts=transaction.objectStore('conflicts'),queue=transaction.objectStore('syncQueue');let outcome=null,failure=null,cloudConflict=null;
    const request=documents.get(sent.id);
    request.onsuccess=()=>{try{
      const latest=request.result||sent;latest.sync={...(latest.sync||{}),status:'conflict',lastError:'Server changed since this device last synced.'};documents.put(latest);
      cloudConflict={id:`${item.ownerId}:${sent.id}`,ownerId:item.ownerId,documentId:sent.id,createdAt:now(),kind:'edit',local:clone(latest),remote:result.server_document,serverVersion:result.current_version};conflicts.put(cloudConflict);
      queue.delete(item.id);outcome=clone(latest)
    }catch(error){failure=error;transaction.abort()}};
    transaction.oncomplete=()=>{if(cloudConflict)reportCloudConflict(cloudConflict);resolve(outcome)};transaction.onerror=()=>reject(failure||transaction.error);transaction.onabort=()=>reject(failure||transaction.error||new Error('Conflict transaction aborted'))
  })
}

async function pushQueueItem(item,allowOwnershipRepair=true,allowDeleteRetry=true){
  const owner=currentUser.id;
  if(item.operation==='delete'){
    const tomb=await get('tombstones',item.id);if(!tomb){await del('syncQueue',item.id);return}
    let result;
    try{result=await apiFetch('/rest/v1/rpc/push_document',{method:'POST',body:{p_document_id:tomb.documentId,p_base_version:tomb.baseServerVersion||0,p_document:null,p_deleted:true}})}catch(error){
      if(!/Document ownership mismatch/i.test(error.message))throw error;
      const trashed=await get('trash',item.id);if(trashed){trashed.cloudSynced=false;trashed.syncError='Cloud record belongs to a different account ID; local trash copy preserved.';await put('trash',trashed)}
      await del('syncQueue',item.id);await del('tombstones',item.id);return {status:'ownership-mismatch'}
    }
    if(result?.status==='conflict'){tomb.baseServerVersion=Number(result.current_version||tomb.baseServerVersion||0);await put('tombstones',tomb);await del('conflicts',`${owner}:${tomb.documentId}`);const trashed=await get('trash',item.id);if(trashed){trashed.baseServerVersion=tomb.baseServerVersion;trashed.cloudSynced=false;trashed.syncError='Deletion is retrying against the latest cloud version.';await put('trash',trashed)}if(allowDeleteRetry)return pushQueueItem(item,allowOwnershipRepair,false);await put('syncQueue',{...item,queuedAt:now()});scheduleAutoSync();return {status:'delete-pending'}}
    const trashed=await get('trash',item.id);if(trashed){trashed.baseServerVersion=Number(result?.current_version||trashed.baseServerVersion||0);trashed.cloudSynced=true;await put('trash',trashed)}await del('syncQueue',item.id);await del('tombstones',item.id);return;
  }
  let doc=await get('documents',item.documentId);if(!doc){await del('syncQueue',item.id);return}
  const clean=clone(doc);delete clean.sync;for(const figure of clean.content?.figures||[])if(String(figure.image||'').startsWith('data:'))figure.image='';
  let result;
  try{result=await apiFetch('/rest/v1/rpc/push_document',{method:'POST',body:{p_document_id:doc.id,p_base_version:Number(doc.sync?.baseServerVersion||0),p_document:clean,p_deleted:false}})}catch(error){
    if(!allowOwnershipRepair||!/Document ownership mismatch/i.test(error.message))throw error;
    const repaired=await repairDocumentIdentity(doc,item),repairedItem=await get('syncQueue',`${owner}:${repaired.id}`);
    const outcome=repairedItem?await pushQueueItem(repairedItem,false):{status:'ownership-repaired',documentId:repaired.id},latest=await get('documents',repaired.id);
    if(latest)window.dispatchEvent(new CustomEvent('teryaq-document-rekeyed',{detail:{oldId:doc.id,document:clone(latest)}}));
    return outcome
  }
  if(result?.status==='conflict'){
    const conflicted=await recordEditConflict(doc,item,result);emitDocumentSyncMetadata(conflicted);return {status:'conflict'};
  }
  const reconciled=await reconcileSuccessfulPush(doc,item,Number(result?.current_version||doc.sync?.baseServerVersion||1));
  if(reconciled?.document)emitDocumentSyncMetadata(reconciled.document);
  if(reconciled?.newerLocal)scheduleAutoSync();
  return reconciled
}

function reconcileRemoteDocument(remote){
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(['documents','conflicts','syncQueue'],'readwrite'),documents=transaction.objectStore('documents'),conflicts=transaction.objectStore('conflicts'),queue=transaction.objectStore('syncQueue');let outcome=null,failure=null,cloudConflict=null;
    const request=documents.get(remote.id),remoteVersion=Number(remote.current_version||0);
    request.onsuccess=()=>{try{
      const local=request.result;
      if(local){
        const localStatus=local.sync?.status||'local-only',localVersion=Number(local.sync?.baseServerVersion||0);
        if(['pending','local-only'].includes(localStatus)){
          if(remoteVersion>localVersion){local.sync={...(local.sync||{}),status:'conflict',lastError:'A newer cloud version exists; the local draft was preserved.'};documents.put(local);cloudConflict={id:`${currentUser.id}:${remote.id}`,ownerId:currentUser.id,documentId:remote.id,createdAt:now(),kind:'edit',local:clone(local),remote:clone(remote.document_json),serverVersion:remoteVersion};conflicts.put(cloudConflict);queue.delete(`${currentUser.id}:${remote.id}`);outcome={status:'conflict',document:clone(local)}}
          else outcome={status:'local-preserved',document:clone(local)};
          return
        }
        if(localStatus!=='synced'||remoteVersion<=localVersion){outcome={status:'unchanged',document:clone(local)};return}
      }
      const applied=migrateDocument(remote.document_json,currentUser.id);applied.ownerId=currentUser.id;applied.sync={status:'synced',baseServerVersion:remoteVersion,lastSyncedAt:now(),lastError:null};documents.put(applied);outcome={status:'applied',document:clone(applied)}
    }catch(error){failure=error;transaction.abort()}};
    transaction.oncomplete=()=>{if(cloudConflict)reportCloudConflict(cloudConflict);resolve(outcome)};transaction.onerror=()=>reject(failure||transaction.error);transaction.onabort=()=>reject(failure||transaction.error||new Error('Remote reconciliation transaction aborted'))
  })
}
function markDocumentSyncError(documentId,message){
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('documents','readwrite'),documents=transaction.objectStore('documents');let failure=null;
    const request=documents.get(documentId);
    request.onsuccess=()=>{try{const latest=request.result;if(latest&&latest.sync?.status==='pending'){latest.sync.lastError=message;documents.put(latest)}}catch(error){failure=error;transaction.abort()}};
    transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(failure||transaction.error);transaction.onabort=()=>reject(failure||transaction.error||new Error('Sync error transaction aborted'))
  })
}

async function pullRemote(){
  const rows=await apiFetch(`/rest/v1/documents?owner_id=eq.${encodeURIComponent(currentUser.id)}&select=id,owner_id,document_json,current_version,updated_at,deleted_at&order=updated_at.asc`);
  for(const r of rows||[]){
    const local=await get('documents',r.id),trashId=`${currentUser.id}:${r.id}`;const remoteVersion=Number(r.current_version||0);
    if(r.deleted_at){
      const localStatus=local?.sync?.status||'local-only';
      if(local&&localStatus!=='synced'){const conflict={id:trashId,ownerId:currentUser.id,documentId:r.id,createdAt:now(),kind:'remote-delete',local:clone(local),remote:null,serverVersion:remoteVersion};await put('conflicts',conflict);reportCloudConflict(conflict);local.sync.status='conflict';local.sync.lastError='The cloud copy was deleted; the unsynced local draft was preserved.';await put('documents',local)}
      else{const existingTrash=await get('trash',trashId),deletedDoc=existingTrash?.document||(r.document_json?migrateDocument(r.document_json,currentUser.id):local);if(deletedDoc)await put('trash',{...(existingTrash||{}),id:trashId,ownerId:currentUser.id,documentId:r.id,document:clone(deletedDoc),deletedAt:r.deleted_at,title:existingTrash?.title||deletedDoc.title||r.id,baseServerVersion:remoteVersion,cloudSynced:true});if(local)await del('documents',r.id)}
      continue
    }
    if(!r.document_json)continue;
    const restoredTrash=await get('trash',trashId);if(restoredTrash?.cloudSynced&&remoteVersion>Number(restoredTrash.baseServerVersion||0)){await del('trash',trashId);await del('tombstones',trashId);await del('syncQueue',trashId)}
    const outcome=await reconcileRemoteDocument(r);
    if(outcome?.status==='applied')window.dispatchEvent(new CustomEvent('teryaq-remote-document-applied',{detail:{document:clone(outcome.document)}}));
    else if(outcome?.status==='conflict')emitDocumentSyncMetadata(outcome.document)
  }
}

function versionParts(v){return String(v||'0').split('.').map(x=>parseInt(x,10)||0)}
function versionLt(a,b){const aa=versionParts(a),bb=versionParts(b);for(let i=0;i<Math.max(aa.length,bb.length);i++){const x=aa[i]||0,y=bb[i]||0;if(x<y)return true;if(x>y)return false}return false}
async function checkServerCompatibility(){
  try{const rows=await apiFetch('/rest/v1/system_config?key=in.(min_supported_app_version,current_document_schema)&select=key,value');const map=new Map((rows||[]).map(r=>[r.key,r.value]));const min=map.get('min_supported_app_version');if(min&&versionLt(APP_VERSION,String(min)))throw new Error(`This server now requires TERYAQ Master Tool ${min} or newer. Update the app before syncing.`);return true}catch(e){if(/requires TERYAQ Master Tool/.test(e.message))throw e;console.warn('Compatibility check unavailable:',e.message);return true}
}

async function syncNow({silent=false}={}){
  if(syncPromise)return syncPromise;
  syncPromise=(async()=>{
    const cfg=await getConfig();
    if(!currentUser||!configured(cfg)||!isOnline()){
      updateSyncUi();if(!silent&&!isOnline())alert('You are offline. Your work remains saved locally and will sync when the connection returns.');
      return {ok:false,reason:!currentUser?'signed-out':!configured(cfg)?'not-configured':'offline'}
    }
    syncRunning=true;await settingPut(LAST_SYNC_ATTEMPT_KEY,now());setSyncLabel('Connecting…');
    try{
      await ensureSessionFresh();setSyncLabel('Checking cloud…');await checkServerCompatibility();await registerDevice();await uploadPendingAvatar();
      const q=(await all('syncQueue')).filter(x=>x.ownerId===currentUser.id).sort((a,b)=>String(a.queuedAt).localeCompare(String(b.queuedAt)));
      for(let index=0;index<q.length;index++){setSyncLabel(`Uploading ${index+1}/${q.length}…`);await pushQueueItem(q[index])}
      setSyncLabel('Uploading figure images…');await processMediaQueue();const mediaDocumentQueue=(await all('syncQueue')).filter(x=>x.ownerId===currentUser.id).sort((a,b)=>String(a.queuedAt).localeCompare(String(b.queuedAt)));for(let index=0;index<mediaDocumentQueue.length;index++){setSyncLabel(`Finalizing ${index+1}/${mediaDocumentQueue.length}…`);await pushQueueItem(mediaDocumentQueue[index])}
      setSyncLabel('Checking other devices…');await pullRemote();await getContentOptions({force:true});await settingPut(LAST_SYNC_KEY,now());await settingPut(LAST_SYNC_ERROR_KEY,null);retryDelayMs=2000;
      const remainingQueue=(await all('syncQueue')).filter(x=>x.ownerId===currentUser.id),remainingConflicts=(await all('conflicts')).filter(x=>x.ownerId===currentUser.id),remainingMedia=(await all('mediaQueue')).filter(x=>x.ownerId===currentUser.id&&x.status!=='uploaded');
      if(remainingConflicts.length){setSyncLabel(`${remainingConflicts.length} conflict${remainingConflicts.length===1?'':'s'}`);emitDataChanged();return {ok:false,reason:'conflict',conflicts:remainingConflicts.length,pending:remainingQueue.length}}
      if(remainingMedia.length){setSyncLabel(`${remainingMedia.length} image upload${remainingMedia.length===1?'':'s'} pending`);scheduleAutoSync();emitDataChanged();return {ok:true,pending:true,pendingCount:remainingQueue.length,mediaPending:remainingMedia.length}}
      if(remainingQueue.length){setSyncLabel(`${remainingQueue.length} change${remainingQueue.length===1?'':'s'} still pending`);scheduleAutoSync();emitDataChanged();return {ok:true,pending:true,pendingCount:remainingQueue.length}}
      setSyncLabel('Synced ✓');emitDataChanged();return {ok:true,pending:false}
    }catch(e){
      console.error(e);setSyncLabel('Sync failed · retrying');await settingPut(LAST_SYNC_ERROR_KEY,{message:e.message,at:now()});const queued=(await all('syncQueue')).filter(x=>x.ownerId===currentUser.id&&x.operation==='upsert');for(const item of queued)await markDocumentSyncError(item.documentId,e.message);const retryIn=retryDelayMs;retryDelayMs=Math.min(60000,retryDelayMs*2);scheduleAutoSync(retryIn);if(!silent)alert(`Sync failed: ${e.message}\n\nYour change remains saved locally and queued for automatic retry.`);return {ok:false,reason:'error',error:e.message}
    }finally{syncRunning=false;updateSyncUi()}
  })();
  try{return await syncPromise}finally{syncPromise=null}
}

function renderStatusLabel(el,text){if(!el)return;const icon=window.TeryaqUIIcon?.('success');if(icon&&String(text).includes('✓'))el.innerHTML=String(text).split('✓').map(esc).join(icon);else el.textContent=text}
function setSyncLabel(text){for(const id of ['syncStatus','syncStatusEditor'])renderStatusLabel(byId(id),text)}
async function updateSyncUi(){
  const els=['syncStatus','syncStatusEditor'].map(byId).filter(Boolean);if(!els.length)return;const conflictButton=byId('resolveConflictsBtn');if(!currentUser){els.forEach(el=>el.textContent='');if(conflictButton)conflictButton.classList.add('hidden');return}
  const q=(await all('syncQueue')).filter(x=>x.ownerId===currentUser.id),conflicts=(await all('conflicts')).filter(x=>x.ownerId===currentUser.id),media=(await all('mediaQueue')).filter(x=>x.ownerId===currentUser.id&&x.status!=='uploaded'),lastError=await settingGet(LAST_SYNC_ERROR_KEY);await getAutoSyncEnabled();
  const pendingCount=q.length+media.length,text=syncRunning?'Syncing…':conflicts.length?`${conflicts.length} conflict${conflicts.length===1?'':'s'}`:!isOnline()?(pendingCount?`${pendingCount} offline item${pendingCount===1?'':'s'}`:'Offline · saved locally'):lastError?(pendingCount?`Sync failed · ${pendingCount} queued`:'Sync check failed · retrying'):media.length?`${media.length} image upload${media.length===1?'':'s'} pending`:q.length?`${q.length} uploading soon`:'Synced ✓';els.forEach(el=>{renderStatusLabel(el,text);el.title=lastError?.message||''});if(conflictButton){conflictButton.classList.toggle('hidden',!conflicts.length);const label=conflictButton.querySelector('span:last-child');if(label)label.textContent=`Conflicts (${conflicts.length})`;else conflictButton.textContent=`Conflicts (${conflicts.length})`}
}

async function conflictCount(){return currentUser?(await all('conflicts')).filter(c=>c.ownerId===currentUser.id).length:0}
async function resolveConflicts(documentId=null){
  if(!currentUser)return;const items=(await all('conflicts')).filter(c=>c.ownerId===currentUser.id&&(!documentId||c.documentId===documentId));const body=byId('modalBody');body.innerHTML=`<h3>${documentId?'Document Conflict':'Sync Conflicts'}</h3><p>Nothing is overwritten automatically. Choose the correct result: keep this device's copy, use the server copy, or preserve both.</p>`;
  if(!items.length)body.innerHTML+='<p class="history-explainer">✓ No unresolved conflict remains for this document.</p>';
  for(const c of items){const row=document.createElement('div');row.className='sync-conflict';const title=c.local?.title||c.remote?.title||c.documentId;row.innerHTML=`<div><strong>${esc(title)}</strong><br><small>${esc(c.kind)} · server version ${c.serverVersion||'?'}</small></div><div class="conflict-actions"><button class="btn small keep-local">Keep local</button><button class="btn small use-server">Use server</button><button class="btn small save-both">Save both</button></div>`;
    row.querySelector('.keep-local').onclick=async()=>{const latest=await get('documents',c.documentId),source=latest||c.local;if(!source)return;const d=clone(source);d.sync={status:'pending',baseServerVersion:Number(c.serverVersion||0),lastSyncedAt:null,lastError:null};await put('documents',d);await del('conflicts',c.id);await resolveCloudConflict(c.documentId,'keep-local');await queueDocument(d);await syncNow({silent:true});resolveConflicts(documentId);emitDataChanged()};
    row.querySelector('.use-server').onclick=async()=>{if(c.remote){const d=migrateDocument(c.remote,currentUser.id);d.sync={status:'synced',baseServerVersion:Number(c.serverVersion||0),lastSyncedAt:now(),lastError:null};await put('documents',d)}else await del('documents',c.documentId);await del('conflicts',c.id);await del('syncQueue',`${currentUser.id}:${c.documentId}`);await resolveCloudConflict(c.documentId,'use-server');resolveConflicts(documentId);emitDataChanged()};
    row.querySelector('.save-both').onclick=async()=>{const latest=await get('documents',c.documentId),source=latest||c.local;if(source){const copy=clone(source);copy.id=uid('doc');copy.title=(copy.title||'Document')+' — Conflict copy';decorateNewDocument(copy);await put('documents',copy);await queueDocument(copy)}if(c.remote){const d=migrateDocument(c.remote,currentUser.id);d.sync={status:'synced',baseServerVersion:Number(c.serverVersion||0),lastSyncedAt:now(),lastError:null};await put('documents',d)}else await del('documents',c.documentId);await del('conflicts',c.id);await del('syncQueue',`${currentUser.id}:${c.documentId}`);await resolveCloudConflict(c.documentId,'save-both');resolveConflicts(documentId);emitDataChanged()};
    body.appendChild(row)
  }
  byId('modal').classList.remove('hidden');
}

async function exportWorkspaceBackup(){
  if(!currentUser)return;const docs=await ownedDocuments();const snaps=await ownedSnapshots();const templates=await ownedTemplates();const trash=await ownedTrash();const conflicts=(await all('conflicts')).filter(c=>c.ownerId===currentUser.id);const backup={format:'TeryaqWorkspaceBackup',backupVersion:'1.1.0',exportedAt:now(),appVersion:APP_VERSION,schemaVersion:DOCUMENT_SCHEMA_VERSION,account:{id:currentUser.id,email:currentUser.email,displayName:currentUser.displayName},documents:docs,snapshots:snaps,templates,trash,conflicts};
  downloadJson(backup,`Teryaq_Workspace_${safe(currentUser.email)}_${new Date().toISOString().slice(0,10)}.teryaqbackup`)
}
function safe(s){return String(s||'workspace').replace(/[^a-z0-9_-]+/gi,'_').slice(0,80)}
function downloadJson(obj,name){const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(u);a.remove()},30000)}

async function restoreWorkspaceBackup(file){
  if(!currentUser)throw new Error('Sign in first');const data=JSON.parse(await file.text());if(data.format!=='TeryaqWorkspaceBackup')throw new Error('Not a Teryaq workspace backup');
  const currentDocs=await ownedDocuments();await put('migrationBackups',{id:uid('restore'),ownerId:currentUser.id,createdAt:now(),fromAppVersion:APP_VERSION,toAppVersion:APP_VERSION,documents:clone(currentDocs),reason:'Before workspace restore'});
  const overwrite=confirm('Restore backup into this account?\n\nOK = overwrite documents with matching IDs.\nCancel = import every document as a separate copy.');
  const idMap=new Map();
  const foreignBackup=Boolean(data.account?.id&&data.account.id!==currentUser.id);
  for(let d of data.documents||[]){const oldId=d.id;d=decorateImportedDocument(d);if(foreignBackup||(!overwrite&&await get('documents',d.id))){d.id=uid('doc');d.title=(d.title||'Document')+' — Restored'}idMap.set(oldId,d.id);await put('documents',d);await queueDocument(d)}
  for(let t of data.templates||[]){t=clone(t);t.ownerId=currentUser.id;if(!overwrite&&await get('templates',t.id))t.id=uid('tpl');await put('templates',t)}
  for(let snap of data.snapshots||[]){snap=clone(snap);snap.id=uid('snap');snap.ownerId=currentUser.id;snap.documentId=idMap.get(snap.documentId)||snap.documentId;if(snap.document){snap.document.ownerId=currentUser.id;snap.document.id=snap.documentId}await put('snapshots',snap)}
  for(let item of data.trash||[]){item=clone(item);item.ownerId=currentUser.id;item.id=`${currentUser.id}:${item.documentId}`;if(item.document)item.document.ownerId=currentUser.id;await put('trash',item)}
  emitDataChanged();return (data.documents||[]).length
}

async function exportPreUpgradeBackups(){
  if(!currentUser)return;const rows=(await all('migrationBackups')).filter(x=>x.ownerId===currentUser.id).sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));if(!rows.length)return alert('No local pre-upgrade backups exist for this account on this device.');downloadJson({format:'TeryaqMigrationBackups',exportedAt:now(),account:{id:currentUser.id,email:currentUser.email},backups:rows},`Teryaq_PreUpgrade_Backups_${safe(currentUser.email)}.json`)
}
async function removeLocalAccountData(){
  if(!currentUser)return;const email=currentUser.email;if(!confirm(`Remove all LOCAL data for ${email} from this device?

Synced cloud data is not deleted. Make sure pending changes are synced or backed up first.`))return;
  const stores=['documents','snapshots','templates','syncQueue','tombstones','trash','conflicts','migrationBackups','mediaQueue'];for(const store of stores){for(const x of await all(store)){if(x.ownerId===currentUser.id)await del(store,x.id)}}for(const item of await all('appCache'))if(String(item.key||'').includes(currentUser.id))await del('appCache',item.key);await del('accounts',currentUser.id);await signOut();location.reload()
}

async function showSettingsPage(target='settingsPageBody'){
  const body=byId(target);if(!body)return;const cfg=await getConfig(),deviceId=await getDeviceId(),last=await settingGet(LAST_SYNC_KEY),attempt=await settingGet(LAST_SYNC_ATTEMPT_KEY),lastError=await settingGet(LAST_SYNC_ERROR_KEY),q=(await all('syncQueue')).filter(x=>x.ownerId===currentUser?.id),media=(await all('mediaQueue')).filter(x=>x.ownerId===currentUser?.id&&x.status!=='uploaded'),c=await conflictCount();await getAutoSyncEnabled();
  body.innerHTML=`<section class="page-form-card"><h3>Synchronization</h3><p>Local autosave is always active. Cloud synchronization is always on when this device has internet, and queued changes retry automatically.</p><div class="sync-always-on"><b>● Automatic Sync: On</b><span>Checks after every save, when the app opens or returns to the foreground, when internet returns, and every 15 seconds.</span></div><div class="settings-grid"><div><b>Device</b><br>${esc(deviceName())}</div><div><b>Last successful sync</b><br>${esc(last?new Date(last).toLocaleString():'Never')}</div><div><b>Waiting sync</b><br>${q.length+media.length}<small>${media.length} image upload${media.length===1?'':'s'}</small></div><div><b>Conflicts</b><br>${c}</div><div><b>Last attempt</b><br>${esc(attempt?new Date(attempt).toLocaleString():'Never')}</div><div><b>Last error</b><br>${esc(lastError?.message||'None')}</div></div><div class="modal-actions"><button class="btn primary" id="settingsSyncNow">Sync Now</button><button class="btn" id="settingsConflicts">Resolve Conflicts</button></div></section><section class="page-form-card"><h3>Cloud connection</h3><p>Stored only on this device. Use the public publishable/anon key—never a service-role key.</p><div class="field"><label>Supabase project URL</label><input id="settingsProjectUrl" value="${esc(cfg.projectUrl)}"></div><div class="field"><label>Supabase publishable key</label><textarea id="settingsAnonKey" rows="3">${esc(cfg.anonKey)}</textarea></div><div class="modal-actions"><button class="btn primary" id="saveCloudConfig">Save connection</button></div></section><section class="page-form-card"><h3>Backups & device data</h3><p>Protect local work before a major update, browser reset, or device replacement.</p><div class="modal-actions"><button class="btn" id="workspaceBackup">Export Workspace Backup</button><button class="btn" id="workspaceRestore">Restore Workspace Backup</button><button class="btn" id="migrationBackupExport">Export Pre-Upgrade Backups</button><input id="workspaceRestoreFile" type="file" accept=".teryaqbackup,.json" hidden></div><div class="backup-explainer"><p><b>Workspace Backup:</b> documents, local history, custom templates, trash, and conflicts for this account.</p><p><b>Restore:</b> imports a previously exported workspace backup into this account.</p><p><b>Pre-Upgrade Backups:</b> emergency copies automatically kept before major data upgrades.</p></div><div class="settings-grid"><div><b>Device ID</b><br><code>${esc(deviceId)}</code><small>Identifier for this browser installation—not your hardware serial number.</small></div><div><b>Role</b><br>${esc(currentUser?.role||'user')}<small>Your account permission level.</small></div></div><div class="signout-explainer"><p><b>Sign out</b> keeps this account's local data on the device.</p><p><b>Sign out & Remove Local Data</b> removes it from this device only; synchronized cloud data remains.</p></div><div class="modal-actions"><button class="btn danger" id="signOutBtn">Sign out</button><button class="btn danger" id="removeLocalDataBtn">Sign out & Remove Local Data</button></div></section>`;
  byId('saveCloudConfig').onclick=async()=>{await saveConfig({projectUrl:byId('settingsProjectUrl').value,anonKey:byId('settingsAnonKey').value});alert('Cloud connection saved on this device.');scheduleAutoSync(0)};byId('settingsSyncNow').onclick=async()=>{await syncNow();showSettingsPage(target)};byId('settingsConflicts').onclick=()=>resolveConflicts();byId('workspaceBackup').onclick=()=>exportWorkspaceBackup();byId('workspaceRestore').onclick=()=>byId('workspaceRestoreFile').click();byId('migrationBackupExport').onclick=()=>exportPreUpgradeBackups();byId('workspaceRestoreFile').onchange=async e=>{if(e.target.files[0]){try{const n=await restoreWorkspaceBackup(e.target.files[0]);alert(`${n} document(s) restored.`)}catch(err){alert(err.message)}}};byId('signOutBtn').onclick=async()=>{await signOut();location.reload()};byId('removeLocalDataBtn').onclick=()=>removeLocalAccountData()
}
async function showSettings(){return showSettingsPage('settingsPageBody')}

function avatarCropGeometry(image,stageSize,zoomPercent,panX,panY){
  const width=Math.max(1,image.naturalWidth||1),height=Math.max(1,image.naturalHeight||1),scale=Math.max(stageSize/width,stageSize/height)*Math.max(1,zoomPercent/100),renderWidth=width*scale,renderHeight=height*scale,maxX=Math.max(0,(renderWidth-stageSize)/2),maxY=Math.max(0,(renderHeight-stageSize)/2);
  return {scale,renderWidth,renderHeight,left:(stageSize-renderWidth)/2+(panX/100)*maxX,top:(stageSize-renderHeight)/2+(panY/100)*maxY,maxX,maxY}
}
async function avatarCropBlob(image,stage,zoomPercent,panX,panY){
  const stageSize=stage.clientWidth||280,geometry=avatarCropGeometry(image,stageSize,zoomPercent,panX,panY),canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const sourceX=Math.max(0,-geometry.left/geometry.scale),sourceY=Math.max(0,-geometry.top/geometry.scale),sourceSize=stageSize/geometry.scale;canvas.getContext('2d',{alpha:false}).drawImage(image,sourceX,sourceY,sourceSize,sourceSize,0,0,512,512);return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Photo crop failed.')),'image/jpeg',.9))
}
async function showAccountPage(target='accountPageBody'){
  const body=byId(target);if(!body)return;const name=currentUser?.displayName||'',avatar=await profileAvatarSource();body.innerHTML=`<div class="profile-grid"><section class="page-form-card"><h3>Profile</h3><p>This name and photo are shown in greetings and the account menu.</p><div class="profile-photo-editor"><img id="profileAvatarPreview" src="${esc(avatar)}" alt="Profile"><div><b>${esc(name||'No username yet')}</b><small>${esc(currentUser?.email||'')}</small><div class="row-actions"><button class="btn small" id="chooseProfileAvatar" type="button">Choose photo</button><button class="btn small" id="removeProfileAvatar" type="button">Use default</button><input id="profileAvatarFile" type="file" accept="image/*" hidden></div><small>JPG, PNG, or WebP · maximum 5 MB. Choose a photo, then crop, zoom, and reposition it before saving.</small></div></div><section class="avatar-crop-editor hidden" id="avatarCropEditor" aria-label="Crop profile photo"><div class="avatar-crop-stage" id="avatarCropStage" tabindex="0" aria-label="Drag the photo to reposition it"><img id="avatarCropImage" alt="Photo crop preview" draggable="false"></div><div class="avatar-crop-controls"><div><b>Adjust photo</b><small>Drag the image, or use the controls below.</small></div><label>Zoom <input id="avatarCropZoom" type="range" min="100" max="250" value="100" step="1"></label><label>Left / Right <input id="avatarCropX" type="range" min="-100" max="100" value="0" step="1"></label><label>Up / Down <input id="avatarCropY" type="range" min="-100" max="100" value="0" step="1"></label><div class="avatar-crop-actions"><button class="btn small" id="cancelAvatarCrop" type="button">Cancel</button><button class="btn primary small" id="applyAvatarCrop" type="button">Apply crop</button></div></div></section><div class="field profile-name-field"><label>Username / Display name</label><input id="profileDisplayName" maxlength="80" value="${esc(name)}" placeholder="Your name"></div><div class="field"><label>Email</label><input value="${esc(currentUser?.email||'')}" readonly></div><div class="modal-actions"><button class="btn primary" id="saveDisplayName">Save profile</button></div><p class="hint" id="displayNameStatus"></p></section><section class="page-form-card password-card"><h3>Change password</h3><p>The new password applies to this Supabase account on every device.</p><div class="password-change-fields"><div class="field"><label>New password</label><div class="password-field"><input id="newAccountPassword" type="password" autocomplete="new-password" minlength="8">${passwordToggleMarkup('newAccountPasswordToggle')}</div></div><div class="field"><label>Confirm password</label><div class="password-field"><input id="confirmAccountPassword" type="password" autocomplete="new-password" minlength="8">${passwordToggleMarkup('confirmAccountPasswordToggle')}</div></div></div><button class="btn password-change-button" id="changePasswordBtn">Change password</button><p class="hint" id="changePasswordStatus">Use at least 8 characters. Internet is required.</p></section></div>`;
  bindPasswordToggle('newAccountPasswordToggle','newAccountPassword');bindPasswordToggle('confirmAccountPasswordToggle','confirmAccountPassword');
  const cropEditor=byId('avatarCropEditor'),cropStage=byId('avatarCropStage'),cropImage=byId('avatarCropImage'),zoom=byId('avatarCropZoom'),panX=byId('avatarCropX'),panY=byId('avatarCropY'),status=byId('displayNameStatus');let cropUrl='',drag=null;
  const updateCropPreview=()=>{if(!cropImage.naturalWidth)return;const size=cropStage.clientWidth||280,g=avatarCropGeometry(cropImage,size,Number(zoom.value),Number(panX.value),Number(panY.value));cropImage.style.width=`${g.renderWidth}px`;cropImage.style.height=`${g.renderHeight}px`;cropImage.style.left=`${g.left}px`;cropImage.style.top=`${g.top}px`};
  const closeCrop=()=>{cropEditor.classList.add('hidden');drag=null;if(cropUrl){URL.revokeObjectURL(cropUrl);cropUrl=''}byId('profileAvatarFile').value=''};
  for(const input of [zoom,panX,panY])input.oninput=updateCropPreview;
  cropStage.onpointerdown=event=>{if(!cropImage.naturalWidth)return;cropStage.setPointerCapture(event.pointerId);const g=avatarCropGeometry(cropImage,cropStage.clientWidth||280,Number(zoom.value),Number(panX.value),Number(panY.value));drag={x:event.clientX,y:event.clientY,panX:Number(panX.value),panY:Number(panY.value),maxX:g.maxX,maxY:g.maxY};cropStage.classList.add('dragging')};
  cropStage.onpointermove=event=>{if(!drag)return;panX.value=String(Math.max(-100,Math.min(100,drag.panX+(event.clientX-drag.x)/Math.max(1,drag.maxX)*100)));panY.value=String(Math.max(-100,Math.min(100,drag.panY+(event.clientY-drag.y)/Math.max(1,drag.maxY)*100)));updateCropPreview()};
  const endDrag=()=>{drag=null;cropStage.classList.remove('dragging')};cropStage.onpointerup=endDrag;cropStage.onpointercancel=endDrag;
  cropStage.onkeydown=event=>{const step=event.shiftKey?10:3;if(event.key==='ArrowLeft')panX.value=String(Math.max(-100,Number(panX.value)-step));else if(event.key==='ArrowRight')panX.value=String(Math.min(100,Number(panX.value)+step));else if(event.key==='ArrowUp')panY.value=String(Math.max(-100,Number(panY.value)-step));else if(event.key==='ArrowDown')panY.value=String(Math.min(100,Number(panY.value)+step));else return;event.preventDefault();updateCropPreview()};
  byId('chooseProfileAvatar').onclick=()=>byId('profileAvatarFile').click();byId('profileAvatarFile').onchange=event=>{const file=event.target.files[0];if(!file)return;if(!file.type.startsWith('image/')){status.textContent='Choose an image file.';return}if(file.size>5*1024*1024){status.textContent='Profile image must be 5 MB or smaller.';return}if(cropUrl)URL.revokeObjectURL(cropUrl);cropUrl=URL.createObjectURL(file);cropImage.onload=()=>{zoom.value='100';panX.value='0';panY.value='0';cropEditor.classList.remove('hidden');updateCropPreview();cropStage.focus({preventScroll:true});cropEditor.scrollIntoView({behavior:'smooth',block:'nearest'})};cropImage.src=cropUrl;status.textContent='Adjust the crop, then press Apply crop.'};
  byId('cancelAvatarCrop').onclick=()=>{closeCrop();status.textContent='Photo change cancelled.'};byId('applyAvatarCrop').onclick=async()=>{const button=byId('applyAvatarCrop');button.disabled=true;status.textContent='Saving cropped photo locally…';try{const blob=await avatarCropBlob(cropImage,cropStage,Number(zoom.value),Number(panX.value),Number(panY.value)),source=await updateProfileAvatar(blob);byId('profileAvatarPreview').src=source;closeCrop();status.textContent=isOnline()?'Photo cropped, uploaded, and synced.':'Photo cropped and saved locally; upload is queued.'}catch(error){status.textContent=error.message}finally{button.disabled=false}};
  byId('removeProfileAvatar').onclick=async()=>{closeCrop();await removeProfileAvatar();byId('profileAvatarPreview').src='icons/default-avatar.svg';status.textContent='Default avatar restored.'};byId('saveDisplayName').onclick=async()=>{const button=byId('saveDisplayName');button.disabled=true;status.textContent='Saving…';try{const saved=await updateDisplayName(byId('profileDisplayName').value);status.textContent=`Saved as ${saved}.`}catch(e){status.textContent=e.message}finally{button.disabled=false}};byId('changePasswordBtn').onclick=async()=>{const passwordStatus=byId('changePasswordStatus'),password=byId('newAccountPassword').value,confirmation=byId('confirmAccountPassword').value;if(password!==confirmation){passwordStatus.textContent='Passwords do not match.';return}const button=byId('changePasswordBtn');button.disabled=true;try{await changePassword(password);byId('newAccountPassword').value='';byId('confirmAccountPassword').value='';passwordStatus.textContent='Password changed successfully.'}catch(e){passwordStatus.textContent=e.message}finally{button.disabled=false}}
}

async function showTrashPage(target='trashPageBody'){
  const body=byId(target);if(!body)return;const items=await ownedTrash();if(!items.length){body.innerHTML='<div class="empty-state"><b>Trash is empty.</b><br>Deleted documents will appear here and can be restored.</div>';return}body.innerHTML=items.map(item=>`<div class="trash-row" data-trash-id="${esc(item.id)}"><div><b>${esc(item.title||item.document?.title||'Untitled')}</b><small>${esc(item.document?.metadata?.course||item.document?.metadata?.subject||'No course')}${item.hadConflict?' · Conflict returns on restore':''}</small></div><small>Deleted ${esc(new Date(item.deletedAt).toLocaleString())}<br>${item.cloudSynced?'Synced to cloud':'Waiting sync'}</small><div class="row-actions"><button class="btn primary small restore-trash">Restore</button><button class="btn small download-trash">Download</button></div></div>`).join('');body.querySelectorAll('[data-trash-id]').forEach(row=>{const item=items.find(x=>x.id===row.dataset.trashId);row.querySelector('.restore-trash').onclick=async()=>{try{await restoreTrashItem(item.id);await showTrashPage(target)}catch(e){alert(e.message)}};row.querySelector('.download-trash').onclick=()=>downloadJson({format:'TeryaqPackage',packageVersion:'1.0.0',exportedAt:now(),appVersion:APP_VERSION,document:item.document},`${safe(item.title||'Deleted_document')}.teryaq`)})
}

function adminLoadingMarkup(label){return `<div class="admin-loading" role="status" aria-live="polite"><div class="admin-loading-pulse" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><span>Loading ${esc(label)}…</span></div>`}
async function showAdminDashboard(requested='overview',target='adminPageBody'){
  if(!isAdmin())return alert('Admin access required.');const body=byId(target);if(!body)return;if(!isOnline()){body.innerHTML='<div class="issue warn">The Admin Center needs an internet connection because it displays synchronized cloud data.</div>';return}
  const legacy={documents:['operations','documents'],versions:['operations','versions'],conflicts:['operations','conflicts'],requests:['users','requests']},mapped=legacy[requested]||[requested,''],section=mapped[0],sub=mapped[1],sections=[['overview','overview','Overview'],['users','users','Users & Access'],['content','content','Content Setup'],['operations','cloud','Cloud Operations'],['analytics','chart','Analytics'],['audit','activity','Audit Log'],['trash','trash','Trash Management'],['updates','megaphone','Updates']];
  const label=sections.find(item=>item[0]===section)?.[2]||'section',icon=name=>window.TeryaqUIIcon?.(name)||'';body.innerHTML=`<div class="admin-center-shell"><aside class="admin-section-nav"><div class="admin-nav-title"><span>ADMIN CENTER</span><small>v${APP_VERSION}</small></div>${sections.map(([id,iconName,label])=>`<button class="${section===id?'active':''}" data-admin-section="${id}">${icon(iconName)}<span>${label}</span></button>`).join('')}</aside><section class="admin-section-workspace"><div id="adminSectionBody" aria-busy="true"></div><div id="adminSectionLoading">${adminLoadingMarkup(label)}</div></section></div>`;
  body.querySelectorAll('[data-admin-section]').forEach(button=>button.onclick=()=>showAdminDashboard(button.dataset.adminSection,target));const panel=body.querySelector('#adminSectionBody'),loader=body.querySelector('#adminSectionLoading');
  try{await loadAdminSection(section,sub,panel,target);enhanceAdminTables(panel)}catch(error){panel.innerHTML=`<div class="issue error"><b>This section could not load.</b><br>${esc(error.message)}</div>`}finally{panel.removeAttribute('aria-busy');loader.remove()}
}
async function loadAdminSection(section,sub,panel,target){
  const pmapFor=async()=>{const profiles=await apiFetch('/rest/v1/profiles?select=id,email,display_name,role,avatar_path&order=email.asc');return {profiles:profiles||[],pmap:new Map((profiles||[]).map(profile=>[profile.id,profile]))}};
  if(section==='overview'){
    const [profiles,docs]=await Promise.all([apiFetch('/rest/v1/profiles?select=id,role'),apiFetch('/rest/v1/documents?select=id,current_version,deleted_at')]),active=(docs||[]).filter(doc=>!doc.deleted_at),deleted=(docs||[]).filter(doc=>doc.deleted_at),icon=name=>window.TeryaqUIIcon?.(name)||'';
    panel.innerHTML=`<div class="admin-section-heading"><div><span>OVERVIEW</span><h3>Workspace health</h3><p>A lightweight snapshot of synchronized cloud activity.</p></div></div><div class="stat-grid"><article class="stat-card"><span class="stat-icon">${icon('users')}</span><div><b>${profiles?.length||0}</b><small>Users</small></div></article><article class="stat-card indigo"><span class="stat-icon">${icon('documents')}</span><div><b>${active.length}</b><small>Synced documents</small></div></article><article class="stat-card gold"><span class="stat-icon">${icon('history')}</span><div><b>${active.reduce((sum,doc)=>sum+Number(doc.current_version||0),0)}</b><small>Cloud versions</small></div></article><article class="stat-card wine"><span class="stat-icon">${icon('trash')}</span><div><b>${deleted.length}</b><small>In trash</small></div></article></div><section class="page-form-card"><h3>Admin scope</h3><p>Only synchronized cloud data appears here. Local-only edits remain private on each user's device until a successful sync.</p><p class="hint">Admin tools do not change local autosave, conflict ownership, or offline editing.</p></section>`;return
  }
  if(section==='users'){
    panel.innerHTML=`<div class="admin-section-heading"><div><span>USERS & ACCESS</span><h3>Accounts and approvals</h3></div><div class="admin-subtabs"><button data-admin-sub="users" class="${sub!=='requests'?'active':''}">Users</button><button data-admin-sub="requests" class="${sub==='requests'?'active':''}">Account requests</button></div></div><div id="adminSubBody" class="admin-sub-body"></div>`;panel.querySelectorAll('[data-admin-sub]').forEach(button=>button.onclick=()=>showAdminDashboard(button.dataset.adminSub==='requests'?'requests':'users',target));const host=panel.querySelector('#adminSubBody');if(sub==='requests')await renderAdminAccountRequests(host,target);else{const {profiles}=await pmapFor(),docs=await apiFetch('/rest/v1/documents?select=id,owner_id,deleted_at');host.innerHTML=`<section class="portal-panel"><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Active documents</th></tr></thead><tbody>${profiles.map(profile=>`<tr><td>${esc(profile.display_name||'—')}</td><td>${esc(profile.email)}</td><td>${esc(profile.role)}</td><td>${(docs||[]).filter(doc=>doc.owner_id===profile.id&&!doc.deleted_at).length}</td></tr>`).join('')}</tbody></table></div></section>`}return
  }
  if(section==='content'){panel.innerHTML='<div class="admin-section-heading"><div><span>CONTENT SETUP</span><h3>Authors, courses, and chapters</h3></div></div><div id="adminContentBody"></div>';await renderAdminContentOptions(panel.querySelector('#adminContentBody'));return}
  if(section==='operations'){
    const activeSub=sub||'documents';panel.innerHTML=`<div class="admin-section-heading"><div><span>CLOUD OPERATIONS</span><h3>Synchronized documents</h3></div><div class="admin-subtabs"><button data-admin-sub="documents" class="${activeSub==='documents'?'active':''}">Documents</button><button data-admin-sub="versions" class="${activeSub==='versions'?'active':''}">Versions</button><button data-admin-sub="conflicts" class="${activeSub==='conflicts'?'active':''}">Conflicts</button></div></div><div id="adminSubBody" class="admin-sub-body"></div>`;panel.querySelectorAll('[data-admin-sub]').forEach(button=>button.onclick=()=>showAdminDashboard(button.dataset.adminSub,target));const host=panel.querySelector('#adminSubBody');if(activeSub==='versions')await renderAdminVersionIndex(host);else if(activeSub==='conflicts'){const {pmap}=await pmapFor();await renderAdminConflicts(host,pmap)}else{const {pmap}=await pmapFor(),docs=await apiFetch('/rest/v1/documents?deleted_at=is.null&select=id,owner_id,title,template_id,template_version,current_version,updated_at,document_json&order=updated_at.desc');renderAdminDocuments(host,docs||[],pmap);host.querySelectorAll('.admin-download').forEach(button=>button.onclick=()=>{const doc=(docs||[]).find(item=>item.id===button.dataset.id);if(!doc?.document_json)return;downloadJson({format:'TeryaqPackage',packageVersion:'1.0.0',exportedAt:now(),appVersion:APP_VERSION,document:doc.document_json},`${safe(doc.title||doc.id)}.teryaq`)});host.querySelectorAll('.admin-versions').forEach(button=>button.onclick=()=>showAdminVersions(button.dataset.id))}return
  }
  if(section==='analytics'){panel.innerHTML='<div class="admin-section-heading"><div><span>ANALYTICS</span><h3>Cloud activity</h3></div></div><div id="adminAnalyticsBody"></div>';await renderAdminAnalytics(panel.querySelector('#adminAnalyticsBody'),30);return}
  if(section==='audit'){const {pmap}=await pmapFor();panel.innerHTML='<div class="admin-section-heading"><div><span>AUDIT LOG</span><h3>Security and administration events</h3></div></div><div id="adminAuditBody"></div>';await renderAdminAudit(panel.querySelector('#adminAuditBody'),pmap,30);return}
  if(section==='trash'){const {pmap}=await pmapFor(),deleted=await apiFetch('/rest/v1/documents?deleted_at=not.is.null&select=id,owner_id,title,template_id,current_version,updated_at,deleted_at,document_json&order=deleted_at.desc');panel.innerHTML='<div class="admin-section-heading"><div><span>TRASH MANAGEMENT</span><h3>Retention, restore, and permanent deletion</h3></div></div><div id="adminTrashBody"></div>';await renderAdminTrash(panel.querySelector('#adminTrashBody'),deleted||[],pmap,target);return}
  if(section==='updates'){await renderAdminUpdates(panel);return}
}
function enhanceAdminTables(panel){
  panel.querySelectorAll('.admin-table-wrap').forEach((wrap,index)=>{const table=wrap.querySelector('table'),rows=[...(table?.tBodies?.[0]?.rows||[])];if(!table||rows.length<8)return;const controls=document.createElement('div');controls.className='admin-table-controls';controls.innerHTML=`<label><span>Search</span><input type="search" placeholder="Filter this table…"></label><div class="admin-pagination"><button class="btn small" type="button">Previous</button><span></span><button class="btn small" type="button">Next</button></div>`;wrap.before(controls);let page=0,query='',timer,pageSize=25;const render=()=>{const filtered=rows.filter(row=>row.textContent.toLowerCase().includes(query));page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(filtered.length/pageSize)-1)));rows.forEach(row=>row.hidden=true);filtered.slice(page*pageSize,(page+1)*pageSize).forEach(row=>row.hidden=false);controls.querySelector('.admin-pagination span').textContent=`Page ${page+1} of ${Math.max(1,Math.ceil(filtered.length/pageSize))} · ${filtered.length} items`;const buttons=controls.querySelectorAll('button');buttons[0].disabled=page===0;buttons[1].disabled=(page+1)*pageSize>=filtered.length};controls.querySelector('input').oninput=event=>{clearTimeout(timer);timer=setTimeout(()=>{query=event.target.value.trim().toLowerCase();page=0;render()},180)};const buttons=controls.querySelectorAll('button');buttons[0].onclick=()=>{page--;render()};buttons[1].onclick=()=>{page++;render()};render()})
}
async function renderAdminUpdates(panel){
  const result=await getUpdates({force:true}),items=result.items||[];panel.innerHTML=`<div class="admin-section-heading"><div><span>UPDATES</span><h3>Dashboard announcements</h3><p>Visible to every signed-in user in the dashboard and notification bell.</p></div></div><section class="page-form-card"><form id="adminUpdateForm" class="admin-update-form"><div class="field"><label>Title</label><input name="title" maxlength="120" required></div><div class="field"><label>Message</label><textarea name="body" maxlength="3000" rows="4" required></textarea></div><button class="btn primary" type="submit">Publish update</button><p class="hint" id="adminUpdateStatus"></p></form></section><section class="portal-panel"><div class="admin-update-list">${items.map(item=>`<article data-update-id="${esc(item.id)}"><div><b>${esc(item.title)}</b><p>${esc(item.body)}</p><small>${esc(new Date(item.created_at).toLocaleString())}</small></div><button class="btn danger small delete-update" type="button">Delete</button></article>`).join('')||'<div class="empty-state">No updates have been published.</div>'}</div></section>`;panel.querySelector('#adminUpdateForm').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button'),status=byId('adminUpdateStatus'),data=Object.fromEntries(new FormData(event.currentTarget));button.disabled=true;status.textContent='Publishing…';try{await createAppUpdate(data.title,data.body);await renderAdminUpdates(panel)}catch(error){status.textContent=error.message;button.disabled=false}};panel.querySelectorAll('.delete-update').forEach(button=>button.onclick=async()=>{if(!confirm('Delete this update for all users?'))return;button.disabled=true;await deleteAppUpdate(button.closest('[data-update-id]').dataset.updateId);await renderAdminUpdates(panel)})
}

async function renderAdminAnalytics(panel,days){
  const data=await apiFetch('/rest/v1/rpc/admin_analytics',{method:'POST',body:{p_days:days}}),daily=data?.daily_versions||[],top=data?.top_users||[],max=Math.max(1,...daily.map(x=>Number(x.count||0)));
  panel.innerHTML=`<section class="page-form-card admin-governance-toolbar"><div><h3>Admin analytics</h3><p>Cloud-only operational totals. Local drafts are counted only after synchronization.</p></div><label>Period<select id="analyticsPeriod">${[7,30,90,365].map(n=>`<option value="${n}" ${Number(days)===n?'selected':''}>${n} days</option>`).join('')}</select></label></section><div class="admin-metric-grid">${[['Users',data?.users||0],['Active documents',data?.active_documents||0],['Deleted documents',data?.deleted_documents||0],['Versions',data?.versions||0],['Open conflicts',data?.open_conflicts||0],['Pending requests',data?.pending_requests||0],['Audit events',data?.events_in_period||0]].map(([label,value])=>`<article class="admin-metric"><b>${Number(value)}</b><span>${esc(label)}</span></article>`).join('')}</div><div class="admin-analytics-grid"><section class="portal-panel"><h3>Versions created</h3><div class="admin-chart">${daily.length?daily.map(row=>`<div class="admin-chart-row"><span>${esc(row.day)}</span><i style="--bar:${Math.max(3,Math.round(Number(row.count||0)/max*100))}%"></i><b>${Number(row.count||0)}</b></div>`).join(''):'<p class="hint">No versions in this period.</p>'}</div></section><section class="portal-panel"><h3>Top users by active documents</h3><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>User</th><th>Documents</th></tr></thead><tbody>${top.map(row=>`<tr><td>${esc(row.display_name||row.email||row.user_id)}</td><td>${Number(row.documents||0)}</td></tr>`).join('')}</tbody></table></div></section></div>`;
  panel.querySelector('#analyticsPeriod').onchange=event=>renderAdminAnalytics(panel,Number(event.target.value));
}

async function renderAdminVersionIndex(panel){
  const versions=await apiFetch('/rest/v1/document_versions?select=document_id,version,created_at,created_by,document_json,is_deleted&order=created_at.desc&limit=300');
  panel.innerHTML=`<section class="portal-panel"><p class="hint">A version is an immutable cloud snapshot created after an accepted synchronization. Open a document's versions to compare any two snapshots.</p><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Document</th><th>Version</th><th>Created</th><th>State</th><th></th></tr></thead><tbody>${(versions||[]).map(v=>`<tr><td>${esc(v.document_id)}</td><td>${Number(v.version)}</td><td>${esc(new Date(v.created_at).toLocaleString())}</td><td>${v.is_deleted?'Deleted':'Active'}</td><td><div class="row-actions"><button class="btn small version-download" data-doc="${esc(v.document_id)}" data-version="${v.version}" ${v.document_json?'':'disabled'}>Download</button><button class="btn small admin-versions" data-id="${esc(v.document_id)}">Compare</button></div></td></tr>`).join('')}</tbody></table></div></section>`;
  panel.querySelectorAll('.version-download').forEach(button=>button.onclick=()=>{const v=(versions||[]).find(x=>x.document_id===button.dataset.doc&&String(x.version)===button.dataset.version);if(!v?.document_json)return;downloadJson({format:'TeryaqPackage',packageVersion:'1.0.0',exportedAt:now(),appVersion:APP_VERSION,cloudVersion:v.version,document:v.document_json},`${safe(v.document_json.title||v.document_id)}_v${v.version}.teryaq`);recordAdminEvent('version.admin_download','version',`${v.document_id}:${v.version}`,null,{document_id:v.document_id,version:v.version})});
}

async function renderAdminConflicts(panel,pmap){
  const rows=await apiFetch('/rest/v1/sync_conflicts?select=id,document_id,owner_id,device_id,conflict_type,local_base_version,server_version,detected_at,last_seen_at,resolved_at,resolution&order=detected_at.desc&limit=500');
  panel.innerHTML=`<section class="page-form-card"><h3>Cloud conflict dashboard</h3><p>This dashboard shows conflict metadata only. Document content remains protected by its owner and is resolved from the owner's device.</p></section><section class="portal-panel"><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Status</th><th>User</th><th>Document</th><th>Type</th><th>Versions</th><th>Device</th><th>Detected</th></tr></thead><tbody>${(rows||[]).map(row=>{const p=pmap.get(row.owner_id)||{};return `<tr><td><span class="admin-badge ${row.resolved_at?'resolved':'open'}">${row.resolved_at?'Resolved':'Open'}</span></td><td>${esc(p.display_name||p.email||row.owner_id)}</td><td><code>${esc(row.document_id)}</code></td><td>${esc(row.conflict_type)}</td><td>${Number(row.local_base_version||0)} → ${Number(row.server_version||0)}</td><td><code>${esc(row.device_id)}</code></td><td>${esc(new Date(row.detected_at).toLocaleString())}${row.resolution?`<br><small>${esc(row.resolution)}</small>`:''}</td></tr>`}).join('')}</tbody></table></div>${rows?.length?'':'<div class="empty-state">No cloud conflict metadata.</div>'}</section>`;
}

async function renderAdminAccountRequests(panel,target){
  const rows=await apiFetch('/rest/v1/account_requests?select=id,requester_name,email,executor_type,note,status,decision_note,decided_at,invitation_sent_at,created_at,updated_at&order=created_at.desc&limit=500');
  panel.innerHTML=`<section class="page-form-card"><h3>Account requests</h3><p>Approval sends a Supabase invitation. Rejecting a request does not create or delete an authentication account.</p></section><section class="portal-panel"><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Status</th><th>Requester</th><th>Note</th><th>Requested</th><th></th></tr></thead><tbody>${(rows||[]).map(row=>`<tr><td><span class="admin-badge ${esc(row.status)}">${esc(row.status)}</span></td><td><b>${esc(row.requester_name)}</b><br><small>${esc(row.email)}</small></td><td>${esc(row.note||'—')}${row.decision_note?`<br><small>Decision: ${esc(row.decision_note)}</small>`:''}</td><td>${esc(new Date(row.created_at).toLocaleString())}</td><td><div class="row-actions">${row.status==='pending'?`<button class="btn primary small request-action" data-id="${esc(row.id)}" data-action="approve">Approve & invite</button><button class="btn danger small request-action" data-id="${esc(row.id)}" data-action="reject">Reject</button>`:''}${['approved','invited'].includes(row.status)?`<button class="btn small request-action" data-id="${esc(row.id)}" data-action="resend">Resend invite</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>${rows?.length?'':'<div class="empty-state">No account requests.</div>'}</section>`;
  panel.querySelectorAll('.request-action').forEach(button=>button.onclick=async()=>{const action=button.dataset.action,note=action==='resend'?'':(prompt(`Optional note for ${action}:`,'')??null);if(note===null)return;button.disabled=true;button.textContent='Working…';try{await decideAccountRequest(button.dataset.id,action,note);await showAdminDashboard('requests',target)}catch(error){alert(error.message);button.disabled=false;button.textContent=action==='approve'?'Approve & invite':action==='reject'?'Reject':'Resend invite'}});
}

function csvCell(value){let text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);if(/^[=+\-@]/.test(text))text=`'${text}`;return `"${text.replace(/"/g,'""')}"`}
function downloadCsv(rows,name){if(!rows.length)return;const keys=Object.keys(rows[0]),csv='\uFEFF'+[keys.map(csvCell).join(','),...rows.map(row=>keys.map(key=>csvCell(row[key])).join(','))].join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},30000)}
async function renderAdminAudit(panel,pmap,days){
  const since=new Date(Date.now()-Number(days)*86400000).toISOString(),rows=await apiFetch(`/rest/v1/audit_log?created_at=gte.${encodeURIComponent(since)}&select=id,actor_id,event_type,entity_type,entity_id,owner_id,metadata,created_at&order=created_at.desc&limit=1000`);
  panel.innerHTML=`<section class="page-form-card admin-governance-toolbar"><div><h3>Audit log</h3><p>Security and administration events recorded in the cloud.</p></div><div class="row-actions"><label>Period<select id="auditPeriod">${[7,30,90,365].map(n=>`<option value="${n}" ${Number(days)===n?'selected':''}>${n} days</option>`).join('')}</select></label><button class="btn primary" id="exportAuditCsv" ${rows?.length?'':'disabled'}>Export CSV</button></div></section><section class="portal-panel"><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Time</th><th>Event</th><th>Actor</th><th>Entity</th><th>Owner</th><th>Details</th></tr></thead><tbody>${(rows||[]).map(row=>{const actor=pmap.get(row.actor_id)||{},owner=pmap.get(row.owner_id)||{};return `<tr><td>${esc(new Date(row.created_at).toLocaleString())}</td><td><code>${esc(row.event_type)}</code></td><td>${esc(actor.display_name||actor.email||row.actor_id||'System')}</td><td>${esc(row.entity_type)}<br><small>${esc(row.entity_id||'')}</small></td><td>${esc(owner.display_name||owner.email||row.owner_id||'—')}</td><td><code>${esc(JSON.stringify(row.metadata||{}))}</code></td></tr>`}).join('')}</tbody></table></div>${rows?.length?'':'<div class="empty-state">No audit events in this period.</div>'}</section>`;
  panel.querySelector('#auditPeriod').onchange=event=>renderAdminAudit(panel,pmap,Number(event.target.value));
  panel.querySelector('#exportAuditCsv').onclick=()=>{const exported=(rows||[]).map(row=>({created_at:row.created_at,event_type:row.event_type,actor_id:row.actor_id||'',entity_type:row.entity_type,entity_id:row.entity_id||'',owner_id:row.owner_id||'',metadata:row.metadata||{}}));downloadCsv(exported,`TERYAQ_Audit_${new Date().toISOString().slice(0,10)}.csv`);recordAdminEvent('audit.csv_export','audit_log',null,null,{rows:exported.length,period_days:Number(days)})};
}

async function renderAdminTrash(panel,deleted,pmap,target){
  const config=await apiFetch('/rest/v1/system_config?key=eq.trash_retention_days&select=value'),retentionDays=Math.max(1,Number(config?.[0]?.value||30)),cutoff=Date.now()-retentionDays*86400000,eligibleIds=new Set(deleted.filter(doc=>Date.parse(doc.deleted_at)<=cutoff).map(doc=>doc.id));
  panel.innerHTML=`<section class="page-form-card"><h3>All users' trash</h3><p>Administrators can restore a synchronized document at any time. Permanent deletion is available only after the ${retentionDays}-day retention period and cannot be undone.</p></section><section class="portal-panel">${deleted.length?`<div class="admin-trash-toolbar"><label><input id="adminTrashSelectAll" type="checkbox"> Select all</label><span id="adminTrashSelectionCount">0 selected</span><button class="btn danger" id="adminPurgeSelected" type="button" disabled>Delete permanently</button></div><div id="adminTrashStatus" class="admin-trash-status" role="status" aria-live="polite"></div>${deleted.map(doc=>{const owner=pmap.get(doc.owner_id)||{},expired=eligibleIds.has(doc.id),remaining=Math.max(0,Math.ceil((Date.parse(doc.deleted_at)+retentionDays*86400000-Date.now())/86400000));return `<div class="trash-row admin-trash-row" data-admin-trash="${esc(doc.id)}"><label class="admin-trash-checkbox"><input class="admin-trash-select" type="checkbox" value="${esc(doc.id)}" aria-label="Select ${esc(doc.title||doc.id)}"></label><div><b>${esc(doc.title||doc.id)}</b><small>${esc(owner.display_name||owner.email||doc.owner_id)}</small></div><small class="admin-trash-date">Deleted ${esc(new Date(doc.deleted_at).toLocaleString())}<br>${expired?'Retention complete':`${remaining} day(s) until purge is allowed`}</small><div class="row-actions"><button class="btn primary small admin-restore" data-id="${esc(doc.id)}">Restore</button><button class="btn small admin-download" data-id="${esc(doc.id)}" ${doc.document_json?'':'disabled'}>Download</button><button class="btn small admin-versions" data-id="${esc(doc.id)}">Versions</button><button class="btn danger small admin-purge" data-id="${esc(doc.id)}" ${expired?'':'disabled'}>Permanently delete</button></div></div>`}).join('')}`:'<div class="empty-state">No synchronized deleted documents.</div>'}</section>`;
  const checkboxes=[...panel.querySelectorAll('.admin-trash-select')],selectAll=panel.querySelector('#adminTrashSelectAll'),bulk=panel.querySelector('#adminPurgeSelected'),count=panel.querySelector('#adminTrashSelectionCount'),message=panel.querySelector('#adminTrashStatus');
  const syncSelection=()=>{if(!selectAll)return;const selected=checkboxes.filter(box=>box.checked),waiting=selected.filter(box=>!eligibleIds.has(box.value));selectAll.checked=selected.length===checkboxes.length;selectAll.indeterminate=selected.length>0&&selected.length<checkboxes.length;bulk.disabled=selected.length===0||waiting.length>0;count.textContent=`${selected.length} selected`;message.textContent=waiting.length?`${waiting.length} selected document(s) have not completed the ${retentionDays}-day retention period.`:'';checkboxes.forEach(box=>box.closest('.admin-trash-row').classList.toggle('selected-row',box.checked))};
  if(selectAll)selectAll.onchange=()=>{checkboxes.forEach(box=>box.checked=selectAll.checked);syncSelection()};
  checkboxes.forEach(box=>box.onchange=syncSelection);
  const purge=async(ids)=>{if(!ids.length||ids.some(id=>!eligibleIds.has(id)))return;panel.querySelectorAll('button,input').forEach(control=>control.disabled=true);let success=0;const failed=[];for(const id of ids){try{await apiFetch('/functions/v1/admin-governance',{method:'POST',body:{action:'purge_document',document_id:id}});success++}catch(error){failed.push(`${deleted.find(item=>item.id===id)?.title||id}: ${error.message}`)}}await showAdminDashboard('trash',target);const status=byId('adminTrashStatus');if(status){status.textContent=failed.length?`${success} deleted. ${failed.length} failed: ${failed.join(' · ')}`:`${success} permanently deleted.`;status.classList.toggle('issue',!!failed.length);status.classList.toggle('error',!!failed.length)}};
  if(bulk)bulk.onclick=()=>{const ids=checkboxes.filter(box=>box.checked).map(box=>box.value),phrase=`PURGE ${ids.length}`;if(!ids.length||ids.some(id=>!eligibleIds.has(id))||prompt(`Permanently delete ${ids.length} selected document(s) and their cloud attachments? This cannot be undone. Type ${phrase} to continue:`, '')!==phrase)return;void purge(ids)};
  panel.querySelectorAll('.admin-restore').forEach(button=>button.onclick=async()=>{if(!confirm('Restore this document to its owner?'))return;button.disabled=true;try{await apiFetch('/rest/v1/rpc/admin_restore_document',{method:'POST',body:{p_document_id:button.dataset.id}});await showAdminDashboard('trash',target)}catch(error){alert(error.message);button.disabled=false}});
  panel.querySelectorAll('.admin-purge').forEach(button=>button.onclick=()=>{if(button.disabled||prompt('Permanent deletion cannot be undone. Type PURGE to continue:','')!=='PURGE')return;void purge([button.dataset.id])});
}
function sanitizeCatalogNumber(value){const arabic='٠١٢٣٤٥٦٧٨٩',persian='۰۱۲۳۴۵۶۷۸۹';return String(value||'').replace(/[٠-٩]/g,c=>String(arabic.indexOf(c))).replace(/[۰-۹]/g,c=>String(persian.indexOf(c))).replace(/[^0-9.]/g,'')}
async function writeContentOption(kind,data,id=''){
  if(!isAdmin())throw new Error('Admin access required.');const normalizedKind=kind==='subject'?'course':kind,payload={...data};
  if(['author','course'].includes(normalizedKind)){payload.name=String(payload.name||'').trim();if(!payload.name)throw new Error(`${normalizedKind==='author'?'Author':'Course'} name is required.`)}
  if(normalizedKind==='chapter'){payload.chapter_number=sanitizeCatalogNumber(payload.chapter_number);payload.title=String(payload.title||'').trim();if(!payload.subject_id)throw new Error('Select a course first.');if(!payload.chapter_number)throw new Error('Chapter number must contain numbers and dots only.');if(!payload.title)throw new Error('Chapter title is required.')}
  try{await apiFetch('/rest/v1/rpc/admin_save_content_option',{method:'POST',body:{p_kind:normalizedKind,p_id:id||null,p_payload:payload},headers:{'Prefer':'return=representation'}})}catch(error){
    if(!/admin_save_content_option|schema cache|PGRST202|404/i.test(error.message))throw error;
    const tables={author:'content_authors',course:'content_subjects',chapter:'content_chapters'},table=tables[normalizedKind];if(!table)throw new Error('Unknown content option type.');await apiFetch(`/rest/v1/${table}${id?`?id=eq.${encodeURIComponent(id)}`:''}`,{method:id?'PATCH':'POST',body:{...payload,updated_at:now()},headers:{'Prefer':'return=minimal'}})
  }
  return getContentOptions({force:true,strict:true})
}
async function renderAdminContentOptions(panel,requestedCourseId='',notice=null){
  let options;try{options=await getContentOptions({force:true,strict:true})}catch(error){panel.innerHTML=`<section class="page-form-card"><div class="issue error"><b>Content Options setup is incomplete.</b><br>${esc(error.message)}</div><p>Open the Supabase SQL Editor, run <code>009_content_options_repair_course_hierarchy.sql</code>, then return here and press Retry.</p><button class="btn primary" id="retryContentOptions">Retry</button></section>`;byId('retryContentOptions').onclick=()=>renderAdminContentOptions(panel,requestedCourseId);return}
  const courses=options.subjects||[],authors=options.authors||[],chapters=options.chapters||[],selectedCourseId=courses.some(course=>course.id===requestedCourseId)?requestedCourseId:(courses[0]?.id||''),selectedCourse=courses.find(course=>course.id===selectedCourseId),visibleChapters=chapters.filter(chapter=>chapter.subject_id===selectedCourseId),courseChoices=courses.map(course=>`<option value="${esc(course.id)}" ${course.id===selectedCourseId?'selected':''}>${esc(course.name)}${course.active===false?' (inactive)':''}</option>`).join('');
  panel.innerHTML=`<section class="page-form-card admin-options-intro"><div><h3>Content Options</h3><p>Manage Authors and Courses, then manage each Course's own Chapters. Changes reach signed-in devices automatically—no GitHub or Render update is needed.</p></div><button class="btn" id="refreshContentOptions">Refresh</button></section><div class="option-feedback ${notice?.type==='error'?'issue error':notice?'issue success':''}" id="contentOptionsStatus">${esc(notice?.message||'')}</div><div class="admin-options-grid">
  <section class="page-form-card"><h3>Authors</h3><p class="option-order-help"><b>Display order</b> controls where an option appears; smaller numbers appear first.</p><form class="option-add-form" data-add-kind="author"><label class="option-field option-field-name"><span>Author name</span><input name="name" required placeholder="Author name"></label><label class="option-field option-field-order"><span>Display order</span><input name="sort_order" type="number" step="1" value="0"></label><button class="btn primary" type="submit">Add author</button></form><div class="admin-option-list">${authors.map(author=>`<div class="admin-option-row" data-option-kind="author" data-option-id="${esc(author.id)}"><label class="option-field option-field-name"><span>Author name</span><input data-field="name" value="${esc(author.name)}"></label><label class="option-field option-field-order"><span>Display order</span><input data-field="sort_order" type="number" step="1" value="${Number(author.sort_order||0)}"></label><label class="option-active-field"><input data-field="active" type="checkbox" ${author.active!==false?'checked':''}> Active</label><button class="btn small save-option">Save</button></div>`).join('')||'<p class="hint">No authors yet.</p>'}</div></section>
  <section class="page-form-card"><h3>Courses</h3><p class="option-order-help"><b>Display order</b> controls where an option appears; smaller numbers appear first.</p><form class="option-add-form" data-add-kind="course"><label class="option-field option-field-name"><span>Course name</span><input name="name" required placeholder="Course name"></label><label class="option-field option-field-order"><span>Display order</span><input name="sort_order" type="number" step="1" value="0"></label><button class="btn primary" type="submit">Add course</button></form><div class="admin-option-list">${courses.map(course=>`<div class="admin-option-row" data-option-kind="course" data-option-id="${esc(course.id)}"><label class="option-field option-field-name"><span>Course name</span><input data-field="name" value="${esc(course.name)}"></label><label class="option-field option-field-order"><span>Display order</span><input data-field="sort_order" type="number" step="1" value="${Number(course.sort_order||0)}"></label><label class="option-active-field"><input data-field="active" type="checkbox" ${course.active!==false?'checked':''}> Active</label><button class="btn small save-option">Save</button></div>`).join('')||'<p class="hint">No courses yet.</p>'}</div></section>
  <section class="page-form-card admin-chapter-options"><div class="chapter-course-heading"><div><h3>Chapters by Course</h3><p>${selectedCourse?`Showing chapters for ${esc(selectedCourse.name)}.`:'Add a course first, then add its chapters.'}</p><p class="option-order-help"><b>Display order</b> controls where a chapter appears inside this course; smaller numbers appear first.</p></div><label>Course<select id="chapterCourseFilter" ${courses.length?'':'disabled'}><option value="">Select course…</option>${courseChoices}</select></label></div><form class="option-add-form chapter-add-form" data-add-kind="chapter"><label class="option-field option-field-chapter-number"><span>Chapter number</span><input name="chapter_number" required inputmode="decimal" pattern="[0-9.]*" placeholder="e.g., 3" ${selectedCourse?'':'disabled'}></label><label class="option-field option-field-name"><span>Chapter title</span><input name="title" required placeholder="Chapter title" ${selectedCourse?'':'disabled'}></label><label class="option-field option-field-order"><span>Display order</span><input name="sort_order" type="number" step="1" value="0" ${selectedCourse?'':'disabled'}></label><button class="btn primary" type="submit" ${selectedCourse?'':'disabled'}>Add chapter</button></form><div class="admin-option-list">${visibleChapters.map(chapter=>`<div class="admin-option-row chapter-option-row" data-option-kind="chapter" data-option-id="${esc(chapter.id)}"><span class="chapter-course-chip">${esc(selectedCourse?.name||'')}</span><label class="option-field option-field-chapter-number"><span>Chapter number</span><input data-field="chapter_number" inputmode="decimal" pattern="[0-9.]*" value="${esc(chapter.chapter_number)}"></label><label class="option-field option-field-name"><span>Chapter title</span><input data-field="title" value="${esc(chapter.title)}"></label><label class="option-field option-field-order"><span>Display order</span><input data-field="sort_order" type="number" step="1" value="${Number(chapter.sort_order||0)}"></label><label class="option-active-field"><input data-field="active" type="checkbox" ${chapter.active!==false?'checked':''}> Active</label><button class="btn small save-option">Save</button></div>`).join('')||(selectedCourse?'<p class="hint">No chapters in this course yet.</p>':'<p class="hint">Add a course first.</p>')}</div></section></div>`;
  const status=byId('contentOptionsStatus'),setStatus=(message,type='error')=>{status.className=`option-feedback issue ${type}`;status.textContent=message;status.scrollIntoView({behavior:'smooth',block:'nearest'})},run=async(button,task,message)=>{button.disabled=true;const old=button.textContent;button.textContent='Saving…';status.textContent='';status.className='option-feedback';try{await task();await renderAdminContentOptions(panel,selectedCourseId,{type:'success',message})}catch(error){setStatus(error.message);button.disabled=false;button.textContent=old}};
  byId('refreshContentOptions').onclick=()=>renderAdminContentOptions(panel,selectedCourseId);byId('chapterCourseFilter').onchange=event=>renderAdminContentOptions(panel,event.target.value);
  panel.querySelectorAll('[name="chapter_number"],[data-field="chapter_number"]').forEach(input=>input.addEventListener('input',()=>{input.value=sanitizeCatalogNumber(input.value)}));
  panel.querySelectorAll('.option-add-form').forEach(form=>form.onsubmit=event=>{event.preventDefault();const button=form.querySelector('button[type="submit"]'),kind=form.dataset.addKind,data=Object.fromEntries(new FormData(form).entries());data.sort_order=Number(data.sort_order||0);data.active=true;if(kind==='chapter'){data.subject_id=selectedCourseId;data.chapter_number=sanitizeCatalogNumber(data.chapter_number)}run(button,()=>writeContentOption(kind,data),`${kind==='chapter'?'Chapter':kind==='course'?'Course':'Author'} added successfully.`)});
  panel.querySelectorAll('.save-option').forEach(button=>button.onclick=()=>{const row=button.closest('[data-option-id]'),kind=row.dataset.optionKind,data={};row.querySelectorAll('[data-field]').forEach(input=>{data[input.dataset.field]=input.type==='checkbox'?input.checked:input.value.trim()});data.sort_order=Number(data.sort_order||0);if(kind==='chapter'){data.subject_id=selectedCourseId;data.chapter_number=sanitizeCatalogNumber(data.chapter_number)}run(button,()=>writeContentOption(kind,data,row.dataset.optionId),`${kind==='chapter'?'Chapter':kind==='course'?'Course':'Author'} saved successfully.`)})
}
function renderAdminDocuments(panel,docs,pmap){
  panel.innerHTML=`<section class="portal-panel"><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>User</th><th>Document</th><th>Template</th><th>Version</th><th>Updated</th><th></th></tr></thead><tbody>${docs.map(d=>{const p=pmap.get(d.owner_id)||{};return `<tr><td>${esc(p.display_name||p.email||d.owner_id)}</td><td>${esc(d.title||d.id)}</td><td>${esc(d.template_id||'')}</td><td>${Number(d.current_version||0)}</td><td>${esc(new Date(d.updated_at).toLocaleString())}</td><td><div class="row-actions"><button class="btn small admin-download" data-id="${esc(d.id)}">Download</button><button class="btn small admin-versions" data-id="${esc(d.id)}">Versions & compare</button></div></td></tr>`}).join('')}</tbody></table></div></section>`
}

function compactDiffValue(value){
  if(value==null||value==='')return '—';
  let text=typeof value==='string'?value:JSON.stringify(value);
  text=text.replace(/\s+/g,' ').trim();return text.length>320?`${text.slice(0,317)}…`:text
}
function contentItems(document){
  const content=document?.content||{};
  if(Array.isArray(content.blocks))return content.blocks.map((item,index)=>({kind:'Block',key:String(item?.id||`block-${index+1}`),index,item}));
  if(Array.isArray(content.figures))return content.figures.map((item,index)=>({kind:'Figure',key:String(item?.id||item?.code||`figure-${index+1}`),index,item}));
  return []
}
function itemLabel(entry){
  const item=entry?.item||{},code=item.code||item.figureCode||item.tableCode||item.type||item.style||'';
  return `${entry?.kind||'Item'} ${entry?.index+1}${code?` · ${code}`:''}`
}
function compareDocumentVersions(before,after){
  const changes=[],beforeMeta=before?.metadata||{},afterMeta=after?.metadata||{};
  for(const key of new Set([...Object.keys(beforeMeta),...Object.keys(afterMeta)]))if(JSON.stringify(beforeMeta[key])!==JSON.stringify(afterMeta[key]))changes.push({type:'Metadata',label:key,before:compactDiffValue(beforeMeta[key]),after:compactDiffValue(afterMeta[key])});
  for(const key of ['title','templateId','templateVersion'])if(JSON.stringify(before?.[key])!==JSON.stringify(after?.[key]))changes.push({type:'Document',label:key,before:compactDiffValue(before?.[key]),after:compactDiffValue(after?.[key])});
  const left=contentItems(before),right=contentItems(after),leftMap=new Map(left.map(x=>[x.key,x])),rightMap=new Map(right.map(x=>[x.key,x]));
  for(const entry of left){const newer=rightMap.get(entry.key);if(!newer){changes.push({type:'Removed',label:itemLabel(entry),before:compactDiffValue(entry.item),after:'—'});continue}if(entry.index!==newer.index)changes.push({type:'Moved',label:itemLabel(newer),before:`Position ${entry.index+1}`,after:`Position ${newer.index+1}`});if(JSON.stringify(entry.item)!==JSON.stringify(newer.item))changes.push({type:'Changed',label:itemLabel(newer),before:compactDiffValue(entry.item),after:compactDiffValue(newer.item)})}
  for(const entry of right)if(!leftMap.has(entry.key))changes.push({type:'Added',label:itemLabel(entry),before:'—',after:compactDiffValue(entry.item)});
  const known=new Set(['blocks','figures']);for(const key of new Set([...Object.keys(before?.content||{}),...Object.keys(after?.content||{})]))if(!known.has(key)&&JSON.stringify(before?.content?.[key])!==JSON.stringify(after?.content?.[key]))changes.push({type:'Content',label:key,before:compactDiffValue(before?.content?.[key]),after:compactDiffValue(after?.content?.[key])});
  return changes
}
function renderVersionComparison(container,beforeVersion,afterVersion){
  const changes=compareDocumentVersions(beforeVersion.document_json,afterVersion.document_json);
  container.innerHTML=`<div class="version-compare-summary"><b>${changes.length}</b> difference(s) between version ${Number(beforeVersion.version)} and version ${Number(afterVersion.version)}.</div>${changes.length?`<div class="version-diff-list">${changes.map(change=>`<article class="version-diff-row"><header><span class="admin-badge ${change.type.toLowerCase()}">${esc(change.type)}</span><b>${esc(change.label)}</b></header><div><section><small>Version ${Number(beforeVersion.version)}</small><pre>${esc(change.before)}</pre></section><section><small>Version ${Number(afterVersion.version)}</small><pre>${esc(change.after)}</pre></section></div></article>`).join('')}</div>`:'<div class="empty-state">No structural or content differences were found.</div>'}`
}
async function showAdminVersions(documentId){
  try{
    const rows=await apiFetch(`/rest/v1/document_versions?document_id=eq.${encodeURIComponent(documentId)}&select=version,created_at,created_by,document_json,is_deleted&order=version.desc`),usable=(rows||[]).filter(v=>v.document_json),body=byId('modalBody'),optionList=usable.map(v=>`<option value="${v.version}">Version ${Number(v.version)} · ${esc(new Date(v.created_at).toLocaleString())}</option>`).join('');
    body.innerHTML=`<div class="version-modal-head"><div><h3>Document Versions</h3><p class="history-explainer">Compare two immutable cloud snapshots, download one, or export the complete archive. Comparison never edits or restores a document.</p><code>${esc(documentId)}</code></div><button class="btn" id="backAdmin">Close</button></div><section class="version-compare-controls"><label>Earlier version<select id="compareBefore">${optionList}</select></label><label>Later version<select id="compareAfter">${optionList}</select></label><button class="btn primary" id="compareVersions" ${usable.length>1?'':'disabled'}>Compare versions</button></section><div id="versionCompareResult"></div><div class="modal-actions"><button class="btn" id="downloadAllVersions" ${rows?.length?'':'disabled'}>Download all versions</button></div><div class="version-snapshot-list">${(rows||[]).map(v=>`<div class="snapshot-row"><div><b>Version ${Number(v.version)}${v.is_deleted?' · Deleted state':''}</b><br><small>${esc(new Date(v.created_at).toLocaleString())}</small></div><button class="btn small download-version" data-version="${v.version}" ${v.document_json?'':'disabled'}>Download</button></div>`).join('')||'<p>No historical versions yet.</p>'}</div>`;
    if(usable.length>1){byId('compareBefore').value=String(usable[usable.length-1].version);byId('compareAfter').value=String(usable[0].version)}
    byId('backAdmin').onclick=()=>byId('modal').classList.add('hidden');
    byId('downloadAllVersions').onclick=()=>{downloadJson({format:'TeryaqVersionArchive',archiveVersion:'1.0.0',exportedAt:now(),appVersion:APP_VERSION,documentId,versions:rows},`${safe(documentId)}_all_versions.json`);recordAdminEvent('version.archive_download','document',documentId,null,{versions:rows?.length||0})};
    byId('compareVersions').onclick=()=>{const first=usable.find(v=>String(v.version)===byId('compareBefore').value),second=usable.find(v=>String(v.version)===byId('compareAfter').value);if(!first||!second)return;if(first.version===second.version)return alert('Choose two different versions.');const before=Number(first.version)<Number(second.version)?first:second,after=before===first?second:first;renderVersionComparison(byId('versionCompareResult'),before,after);recordAdminEvent('version.compared','document',documentId,null,{before_version:before.version,after_version:after.version})};
    body.querySelectorAll('.download-version').forEach(button=>button.onclick=()=>{const version=(rows||[]).find(v=>String(v.version)===button.dataset.version);if(!version?.document_json)return;downloadJson({format:'TeryaqPackage',packageVersion:'1.0.0',exportedAt:now(),appVersion:APP_VERSION,cloudVersion:version.version,document:version.document_json},`${safe(version.document_json.title||documentId)}_v${version.version}.teryaq`);recordAdminEvent('version.admin_download','version',`${documentId}:${version.version}`,null,{document_id:documentId,version:version.version})});
    byId('modal').classList.remove('hidden')
  }catch(e){alert(e.message)}
}

async function initialize(){
  if(!db)throw new Error('Platform DB not attached');await settingPut(AUTO_SYNC_KEY,true);const cached=inviteSessionFromUrl()?null:await restoreCachedSession();renderAuthGate();if(cached){await claimAndMigrateLegacyData();await reconcileTrashedConflicts();hideAuthGate();return {authenticated:true,user:cached}}return {authenticated:false}
}

function renderAuthGate(){
  const gate=byId('authGate');if(!gate)return;gate.classList.remove('hidden');bindPasswordToggle('authPasswordToggle','authPassword');bindPasswordToggle('invitePasswordToggle','invitePassword');bindPasswordToggle('invitePasswordConfirmToggle','invitePasswordConfirm');const cfgInputs=()=>({projectUrl:byId('authProjectUrl')?.value,anonKey:byId('authAnonKey')?.value}),invite=inviteSessionFromUrl();
  const cloudPanel=byId('authCloudPanel'),cloudToggle=byId('authCloudToggle'),cloudClose=byId('authCloudClose'),cloudScrim=byId('authCloudScrim'),cloudState=byId('authCloudState');
  const setCloudPanel=open=>{const visible=Boolean(open);cloudPanel?.classList.toggle('is-open',visible);cloudPanel?.setAttribute('aria-hidden',String(!visible));cloudToggle?.setAttribute('aria-expanded',String(visible));cloudScrim?.classList.toggle('hidden',!visible||!window.matchMedia('(max-width: 760px)').matches);if(visible)requestAnimationFrame(()=>byId('authProjectUrl')?.focus())};
  if(cloudToggle)cloudToggle.onclick=()=>setCloudPanel(!cloudPanel?.classList.contains('is-open'));if(cloudClose)cloudClose.onclick=()=>setCloudPanel(false);if(cloudScrim)cloudScrim.onclick=()=>setCloudPanel(false);gate.onkeydown=e=>{if(e.key==='Escape'&&cloudPanel?.classList.contains('is-open'))setCloudPanel(false)};
  const requestModal=byId('accountRequestModal'),closeRequest=()=>requestModal?.classList.add('hidden'),openRequest=async()=>{const cfg=await getConfig();if(!configured(cfg)){byId('authError').textContent='Save the Cloud setup connection before requesting an account.';setCloudPanel(true);return}byId('requesterEmail').value=byId('authEmail').value.trim();byId('accountRequestStatus').textContent='';requestModal.classList.remove('hidden');requestAnimationFrame(()=>byId('requesterName').focus())};
  byId('requestAccountBtn').onclick=openRequest;byId('closeAccountRequest').onclick=closeRequest;byId('cancelAccountRequest').onclick=closeRequest;requestModal.onclick=event=>{if(event.target===requestModal)closeRequest()};
  byId('accountRequestForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=byId('submitAccountRequest'),status=byId('accountRequestStatus'),data=Object.fromEntries(new FormData(form).entries());button.disabled=true;button.textContent='Submitting…';status.textContent='';try{await submitAccountRequest(data);status.textContent='Request received. An administrator will review it and send an invitation if approved.';form.reset()}catch(error){status.textContent=error.message}finally{button.disabled=false;button.textContent='Submit request'}};
  const inviteModal=byId('inviteSetupModal'),openInvite=()=>{if(!invite)return;byId('inviteSetupStatus').textContent='';inviteModal.classList.remove('hidden');requestAnimationFrame(()=>byId('invitePassword').focus())};
  byId('inviteSetupForm').onsubmit=async event=>{event.preventDefault();const password=byId('invitePassword').value,confirmation=byId('invitePasswordConfirm').value,status=byId('inviteSetupStatus'),button=byId('completeInviteBtn');if(password!==confirmation){status.textContent='Passwords do not match.';return}button.disabled=true;button.textContent='Creating account…';status.textContent='';try{await completeInvitePassword(invite,password);inviteModal.classList.add('hidden');hideAuthGate();window.dispatchEvent(new CustomEvent('teryaq-authenticated'))}catch(error){status.textContent=error.message;button.disabled=false;button.textContent='Set password & continue'}};
  getConfig().then(cfg=>{if(byId('authProjectUrl'))byId('authProjectUrl').value=cfg.projectUrl||'';if(byId('authAnonKey'))byId('authAnonKey').value=cfg.anonKey||'';const ready=configured(cfg);if(cloudState)cloudState.textContent=ready?'Connection saved on this device':'Configure the Supabase connection';if(invite&&ready){setCloudPanel(false);openInvite()}else{setCloudPanel(!ready);if(invite&&!ready)byId('authError').textContent='Save the Cloud setup connection to finish accepting this invitation.'}});
  byId('saveInitialCloudConfig').onclick=async()=>{const status=byId('initialCloudConfigStatus');status.textContent='';try{const saved=await saveConfig(cfgInputs());if(!configured(saved))throw new Error('Enter both the Supabase project URL and publishable key.');status.textContent=invite?'Connection saved. Complete your invited account.':'Connection saved on this device. You can sign in now.';if(cloudState)cloudState.textContent='Connection saved on this device';if(invite){setCloudPanel(false);openInvite()}}catch(e){status.textContent=e.message}};
  const cachedPromise=settingGet(AUTH_KEY);cachedPromise.then(async s=>{const offline=byId('continueOfflineBtn'),divider=byId('authOfflineDivider'),identity=byId('authOfflineIdentity');if(!s?.user?.id)return;const cached=await get('accounts',s.user.id);if(!cached)return;const label=cached.displayName||cached.email||s.user.email||'cached user',email=cached.email||s.user.email||'';offline.classList.remove('hidden');offline.textContent=`Continue Offline as ${label}`;divider?.classList.remove('hidden');if(identity){identity.textContent=email&&email!==label?email:'Last authenticated account on this device';identity.classList.remove('hidden')}});
  byId('signInBtn').onclick=async()=>{const err=byId('authError');err.textContent='';try{await saveConfig(cfgInputs());byId('signInBtn').disabled=true;byId('signInBtn').textContent='Signing in…';await signIn(byId('authEmail').value.trim(),byId('authPassword').value);hideAuthGate();window.dispatchEvent(new CustomEvent('teryaq-authenticated'))}catch(e){err.textContent=e.message}finally{byId('signInBtn').disabled=false;byId('signInBtn').textContent='Sign in'}};
  byId('continueOfflineBtn').onclick=async()=>{try{await continueOffline();hideAuthGate();window.dispatchEvent(new CustomEvent('teryaq-authenticated'))}catch(e){byId('authError').textContent=e.message}};
}
function hideAuthGate(){byId('authGate')?.classList.add('hidden');byId('appShell')?.classList.remove('hidden');updateAccountUi();updateSyncUi();startAutoSync()}
async function updateAccountUi(){const u=currentUser,name=u?(u.displayName||u.email):'';if(byId('accountLabel'))byId('accountLabel').textContent=name;if(byId('topbarUsername'))byId('topbarUsername').textContent=name||'User';if(byId('topbarAvatarImage'))byId('topbarAvatarImage').src=await profileAvatarSource();if(byId('adminBtn'))byId('adminBtn').classList.toggle('hidden',!isAdmin())}

window.addEventListener('online',()=>{updateSyncUi();scheduleAutoSync(150)});window.addEventListener('offline',()=>{if(autoSyncTimeout){clearTimeout(autoSyncTimeout);autoSyncTimeout=null}updateSyncUi()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleAutoSync(900)});window.addEventListener('focus',()=>scheduleAutoSync(900));window.addEventListener('pageshow',()=>scheduleAutoSync(900));

window.TeryaqPlatform={
  APP_VERSION,DOCUMENT_SCHEMA_VERSION,PLATFORM_SCHEMA,attachDb,setDataChangedCallback,initialize,user,isAdmin,getConfig,saveConfig,getContentOptions,getAutoSyncEnabled,setAutoSyncEnabled,startAutoSync,stopAutoSync,scheduleAutoSync,signIn,signOut,changePassword,updateDisplayName,updateProfileAvatar,removeProfileAvatar,profileAvatarSource,getUpdates,markAllUpdatesRead,markUpdateRead,getAttachmentPreview,continueOffline,getDeviceId,decorateNewDocument,decorateImportedDocument,markDocumentPending,queueDocument,queueDelete,ownedDocuments,ownedTemplates,ownedSnapshots,ownedTrash,restoreTrashItem,syncNow,updateSyncUi,resolveConflicts,showSettings,showSettingsPage,showAccountPage,showTrashPage,showAdminDashboard,showCloudVersions:showAdminVersions,exportWorkspaceBackup,restoreWorkspaceBackup,migrateDocument,claimAndMigrateLegacyData
};
})();
