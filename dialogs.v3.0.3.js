/* Shared application dialogs. Native file choosers and print dialogs are unchanged. */
(()=>{'use strict';
let queue=Promise.resolve();
function show(kind,message,defaultValue=''){
 return new Promise(resolve=>{
  const previous=document.activeElement,dialog=document.createElement('dialog');dialog.className='teryaq-message-dialog';dialog.setAttribute('aria-labelledby','teryaqDialogTitle');dialog.setAttribute('aria-describedby','teryaqDialogMessage');
  dialog.innerHTML='<form><div class="teryaq-dialog-mark" aria-hidden="true">T</div><h2 id="teryaqDialogTitle">TERYAQ · ترياق</h2><p id="teryaqDialogMessage" dir="auto"></p><label class="teryaq-dialog-input"><span>الإجابة / Your response</span><input type="text" autocomplete="off" dir="auto"></label><footer><button class="btn" type="button" data-cancel>Cancel / إلغاء</button><button class="btn primary" type="submit">OK / موافق</button></footer></form>';
  dialog.querySelector('#teryaqDialogMessage').textContent=String(message??'');
  const input=dialog.querySelector('input'),cancel=dialog.querySelector('[data-cancel]');input.value=String(defaultValue??'');dialog.querySelector('label').hidden=kind!=='prompt';cancel.hidden=kind==='alert';
  let complete=false;const finish=value=>{if(complete)return;complete=true;dialog.close();dialog.remove();if(previous?.isConnected)previous.focus();resolve(value)};
  const cancelled=()=>finish(kind==='prompt'?null:kind==='confirm'?false:undefined);
  cancel.onclick=cancelled;dialog.addEventListener('cancel',event=>{event.preventDefault();cancelled()});
  dialog.querySelector('form').onsubmit=event=>{event.preventDefault();finish(kind==='prompt'?input.value:kind==='confirm'?true:undefined)};
  document.body.appendChild(dialog);dialog.showModal();
  if(kind==='prompt'){input.focus();input.select()}else if(kind==='confirm')cancel.focus();else dialog.querySelector('[type=submit]').focus();
 });
}
function request(kind,message,value){const result=queue.then(()=>show(kind,message,value));queue=result.catch(()=>{});return result}
window.TeryaqDialogs={alert:message=>{void request('alert',message)},confirm:message=>request('confirm',message),prompt:(message,value='')=>request('prompt',message,value)};
})();
