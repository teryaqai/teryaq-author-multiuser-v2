/* Shared navigation and progressive UI enhancements; no document data is stored here. */
(()=>{'use strict';
const $=(q,r=document)=>r.querySelector(q),api=()=>window.TeryaqPlatform;
const navPaths={home:'M3 10 12 3l9 7v10H3Zm6 10v-7h6v7',documents:'M6 3h8l4 4v14H6Zm8 0v5h4M9 12h6m-6 4h6',templates:'M3 4h18v5H3Zm0 9h7v8H3Zm11 0h7v8h-7Z',submissionForms:'M7 3h10v3H7Zm-2 2H3v16h18V5h-2M7 13l3 3 7-7',courseProgress:'m2 8 10-5 10 5-10 5Zm4 3v6l6 4 6-4v-6M22 8v9',trash:'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',guide:'M12 5c-3-2-6-2-9 0v15c3-2 6-2 9 0 3-2 6-2 9 0V5c-3-2-6-2-9 0Zm0 0v15',shield:'m12 3 9 4v6c0 4-5 7-9 9-4-2-9-5-9-9V7Zm-5 9 3 3 7-7'};
window.TeryaqBottomIcon=key=>'<svg class="ui-icon bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(navPaths[key]||navPaths.documents)+'"/></svg>';
const nav={entries:[],restoring:false,user:null,visit(entry){
 const uid=api()?.user()?.id;if(uid!==this.user){this.entries=[];this.user=uid}
 if(this.restoring)return;const last=this.entries.at(-1),key=JSON.stringify({...entry,scroll:undefined});
 if(last?.key===key)return;this.entries.push({...entry,key,scroll:window.scrollY});if(this.entries.length>80)this.entries.shift();this.update();
},update(){const b=$('#globalBackButton');if(b)b.disabled=this.entries.length<2},async back(){
 if(this.restoring||this.entries.length<2)return;const target=this.entries.at(-2);this.restoring=true;
 try{const app=window.TeryaqAppWorkflow;let ok;if(target.view==='editor'&&target.documentId)ok=await app.openDocument(target.documentId);else ok=await app.activate(target.view);if(ok===false)return;if(target.view==='courseProgress'&&target.workflow)await window.TeryaqWorkflow.restoreSnapshot(target.workflow);this.entries.pop();requestAnimationFrame(()=>window.scrollTo(0,target.scroll||0));}catch(e){await window.TeryaqDialogs.alert(e.message)}finally{this.restoring=false;this.update()}
}};window.TeryaqNavigation=nav;
window.addEventListener('scroll',()=>{if(!nav.restoring&&nav.entries.length)nav.entries.at(-1).scroll=scrollY},{passive:true});
let saveDetail='',syncDetail='';
window.TeryaqEditorStatus=(kind,text)=>{if(kind==='save')saveDetail=String(text||'');else syncDetail=String(text||'');const el=$('#syncStatusEditor');if(!el)return;
 let label=syncDetail||saveDetail||'Saved locally',severity='';
 if(/failed|conflict/i.test(saveDetail)){label=saveDetail;severity='error'}
 else if(/Saving|Sending|Newer changes|Unsaved/i.test(saveDetail)){label=saveDetail;severity='pending'}
 else if(/sync pending|offline|upload.*pending/i.test(saveDetail)&&!/failed|conflict|Syncing|uploading/i.test(syncDetail)){label=saveDetail;severity='pending'}
 if(/failed|conflict/i.test(label))severity='error';else if(/offline|pending|soon|Saving|Sending|Syncing/i.test(label))severity='pending';
 el.textContent=label.replace(/✓/g,'').trim();el.title=[saveDetail,syncDetail].filter(Boolean).join('\n');el.setAttribute('aria-label','Save and sync status: '+el.textContent);el.classList.toggle('error',severity==='error');el.classList.toggle('pending',severity==='pending');
};
const scrollbars=new Map();
function enhanceTables(){document.querySelectorAll('.responsive-table,.admin-table-wrap,.workflow-table-wrap').forEach(box=>{
 if(scrollbars.has(box)||!box.querySelector('table'))return;const bar=document.createElement('div'),space=document.createElement('div');bar.className='table-top-scroll';bar.tabIndex=0;bar.setAttribute('aria-label','Scroll table horizontally');bar.append(space);box.before(bar);
 const sync=()=>{space.style.width=box.scrollWidth+'px';bar.hidden=box.scrollWidth<=box.clientWidth+1;bar.style.width=box.getBoundingClientRect().width+'px';bar.scrollLeft=box.scrollLeft};
 bar.addEventListener('scroll',()=>{if(box.scrollLeft!==bar.scrollLeft)box.scrollLeft=bar.scrollLeft},{passive:true});box.addEventListener('scroll',()=>{if(bar.scrollLeft!==box.scrollLeft)bar.scrollLeft=box.scrollLeft},{passive:true});
 const observer=new ResizeObserver(sync);observer.observe(box);observer.observe(box.querySelector('table'));scrollbars.set(box,{bar,observer});sync();
});for(const [box,r]of scrollbars)if(!box.isConnected){r.observer.disconnect();r.bar.remove();scrollbars.delete(box)}}
function enhanceSearch(){document.querySelectorAll('input:not([data-clean-search])').forEach(input=>{if(input.type!=='search'&&!/search|بحث|ابحث/i.test(input.placeholder||''))return;input.dataset.cleanSearch='';if(input.closest('.global-search,.tree-search,.search-field,.clean-search,.table-assignment-search,.search-box,.search-input-wrap,.search-control,.submission-search,.filter-search,.search-wrap'))return;const wrap=document.createElement('label');wrap.className='clean-search';const icon=document.createElement('span');icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';input.before(wrap);wrap.append(icon,input);if(!input.hasAttribute('aria-label'))input.setAttribute('aria-label',input.placeholder||'Search')})}
function placePopup(popup){if(popup.hidden)return;const parent=popup.parentElement,button=parent.querySelector('.next-combobox-button');if(!button)return;const r=button.getBoundingClientRect(),below=innerHeight-r.bottom-18,above=r.top-18,up=below<230&&above>below;popup.classList.toggle('opens-up',up);popup.style.maxHeight=Math.max(100,Math.min(320,up?above:below))+'px'}
function enhance(){enhanceTables();enhanceSearch();document.querySelectorAll('.next-combobox-popup:not([data-auto-place])').forEach(p=>{p.dataset.autoPlace='';new MutationObserver(()=>placePopup(p)).observe(p,{attributes:true,attributeFilter:['hidden']});placePopup(p)});nav.update()}
let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance()})};
function init(){const global=$('.topbar-global-actions');if(global&&!$('#globalBackButton')){const b=document.createElement('button');b.id='globalBackButton';b.className='topbar-icon-button';b.type='button';b.title='Back / رجوع';b.setAttribute('aria-label','Back to previous location');b.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 12H5m6-6-6 6 6 6"/></svg>';global.prepend(b);b.onclick=()=>nav.back()}
 $('#workBrandHome')?.addEventListener('click',async e=>{e.preventDefault();await window.TeryaqAppWorkflow?.activate('home')});new MutationObserver(schedule).observe($('#appShell')||document.body,{childList:true,subtree:true});window.addEventListener('resize',()=>{schedule();document.querySelectorAll('.next-combobox-popup').forEach(placePopup)});enhance()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
