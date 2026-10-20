/* Automatic PDF generation runs locally; no external rendering service or API key. */
(()=>{'use strict';let engine;
const load=()=>engine||(engine=new Promise((resolve,reject)=>{if(window.html2pdf)return resolve(window.html2pdf);const script=document.createElement('script');script.src='vendor/html2pdf.bundle.min.js';script.onload=()=>resolve(window.html2pdf);script.onerror=()=>{engine=null;reject(Error('تعذّر تحميل مولّد PDF. أعد فتح الموقع أثناء الاتصال.'))};document.head.append(script)}));
window.TeryaqAutoDelivery={async pdf(html,identity){
 const html2pdf=await load(),frame=document.createElement('iframe');frame.className='auto-pdf-frame';frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;left:-12000px;top:0;width:800px;height:1100px;border:0;';document.body.append(frame);
 try{const doc=frame.contentDocument;doc.open();doc.write(html);doc.close();await doc.fonts.ready;await Promise.all([...doc.images].map(img=>img.complete?(img.naturalWidth?Promise.resolve():Promise.reject(Error('صورة غير متاحة داخل المستند.'))):new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('تعذّر تحميل صورة داخل المستند.'))})));
 const content=document.createElement('div');content.className='auto-pdf-document';content.style.cssText='width:178mm;background:#fff;color:#000;';content.innerHTML=doc.body.innerHTML;
 // Copy the print styles into the detached rendering document. html2canvas clones them with the node.
 const styles=document.createElement('style');styles.textContent=[...doc.querySelectorAll('style')].map(s=>s.textContent).join('\n')+'\n.auto-pdf-document{font-family:Tajawal,Arial,sans-serif;font-size:11pt;line-height:1.3}.auto-pdf-document .cover{break-after:page}.auto-pdf-document img{max-width:100%}.auto-pdf-document>section:last-child{break-after:auto!important;page-break-after:auto!important}';content.prepend(styles);
 const worker=html2pdf().set({margin:[12,16,18,16],image:{type:'jpeg',quality:.95},html2canvas:{scale:1.6,useCORS:true,backgroundColor:'#fff',logging:false},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy'],avoid:['tr','img','.fig']}}).from(content).toPdf();
 const pdf=await worker.get('pdf');pdf.setPage(1);pdf.setFont('courier','normal');pdf.setFontSize(3);pdf.setTextColor(50,50,50);const token=btoa(unescape(encodeURIComponent(JSON.stringify(identity))));pdf.text('TERYAQ-ID:'+token+':END-ID',16,5,{maxWidth:178});pdf.setProperties({title:'TERYAQ Version '+identity.version,subject:'Verified task export'});const blob=pdf.output('blob');if(blob.size<500)throw Error('PDF فارغ أو غير صالح.');return blob;
 }finally{frame.remove()}
}};
})();
