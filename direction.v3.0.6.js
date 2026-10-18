/* Automatic paragraph direction for task notes, lists, forms and dialogs. */
(()=>{'use strict';
const direction=text=>{const first=String(text||'').match(/\p{L}/u)?.[0];return first&&/[\u0590-\u08ff\ufb1d-\ufeff]/.test(first)?'rtl':'ltr'};
const roots='.instruction-rich,.required-rich-text,.workflow-rich-input,.submission-notes,.workflow-event p,.task-checklist-item label span,.checklist-builder-row input';
function apply(root=document){for(const el of root.querySelectorAll(roots)){if(el.matches('input,textarea')){el.dir='auto';continue}const blocks=[...el.querySelectorAll('p,div,li,h1,h2,h3,h4,blockquote,ul,ol')];if(!blocks.length)el.dir=direction(el.textContent);else{el.dir='auto';for(const block of blocks)block.dir=direction(block.textContent);}}
for(const el of root.querySelectorAll('textarea,input[type=text],input[type=search],input:not([type])'))if(!el.closest('.doc-page,.document-page,.editor-page')&&!el.hasAttribute('dir'))el.dir='auto';}
let pending=false;const schedule=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;apply()})};
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});document.addEventListener('input',e=>{if(e.target.closest(roots))schedule()});
document.addEventListener('paste',e=>{const editor=e.target.closest('.workflow-rich-input');if(!editor)return;e.preventDefault();const text=e.clipboardData?.getData('text/plain')||'';document.execCommand('insertText',false,text);schedule()});apply();
let tip;
function hideTip(){tip?.remove();tip=null;}
function showTip(node){hideTip();if(!node)return;tip=document.createElement('div');tip.className='tq-floating-status-tip';tip.setAttribute('role','tooltip');tip.textContent=node.dataset.statusTip;document.body.append(tip);const r=node.getBoundingClientRect(),t=tip.getBoundingClientRect();tip.style.left=Math.max(8,Math.min(r.left+r.width/2-t.width/2,innerWidth-t.width-8))+'px';tip.style.top=(r.top>t.height+12?r.top-t.height-10:r.bottom+10)+'px';}
document.addEventListener('mouseover',e=>{const node=e.target.closest('[data-status-tip]');if(node&&!node.contains(e.relatedTarget))showTip(node)});document.addEventListener('mouseout',e=>{const node=e.target.closest('[data-status-tip]');if(node&&!node.contains(e.relatedTarget))hideTip()});document.addEventListener('focusin',e=>{if(e.target.matches('[data-status-tip]'))showTip(e.target)});document.addEventListener('focusout',hideTip);window.addEventListener('scroll',hideTip,true);window.addEventListener('resize',hideTip);
window.TeryaqDirection={apply,direction};
})();
