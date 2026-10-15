const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const root=require('node:path').resolve(__dirname,'..');
const source=fs.readFileSync(root+'/supabase/functions/google-sheets-sync/index.ts','utf8');
const id='11111111-1111-4111-8111-111111111111';
const defaults={SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only',SHEETS_TEST_TASK_ID:id,SHEETS_SYNC_ENABLED:'true',SHEETS_SYNC_TOKEN:'private-token',SHEETS_WEBHOOK_SECRET:'w'.repeat(40),SHEETS_WEB_APP_URL:'https://script.google.com/macros/s/TEST/exec'};
function edge({env={},role='admin',auth=true,failDelivery=false}={}){
 let handler,calls=[];
 const db={profiles:[{role,display_name:'Executor',member_code:'M001'}],workflow_tasks:{id,workflow_id:'flow',title:'Actual task',stage:'Questions',status:'in_review',owner_id:'owner'},course_workflows:{course_id:'course',chapter_id:'chapter'},content_subjects:{name:'Course'},content_chapters:{chapter_number:'1',title:'Chapter'},workflow_task_executors:[{user_id:'owner'}]};
 const client={auth:{getUser:async()=>({data:{user:auth?{id:'admin'}:null},error:auth?null:{message:'bad'}})},from(table){const q={select(){return q},eq(){return q},in(){return q},single(){return Promise.resolve({data:Array.isArray(db[table])?db[table][0]:db[table],error:null})},then(resolve,reject){return Promise.resolve({data:db[table],error:null}).then(resolve,reject)}};return q}};
 const code=stripTypeScriptTypes(source.replace(/^import .*\n/,''));
 vm.runInNewContext(code,{createClient:()=>client,Deno:{env:{get:key=>({...defaults,...env})[key]},serve:h=>handler=h},Response,AbortSignal,fetch:async(url,opts)=>{calls.push(JSON.parse(opts.body));if(failDelivery)throw Error('private remote info');return new Response(JSON.stringify({ok:true}))}});
 return {calls,run:async(body,headers={Authorization:'Bearer user'})=>{const r=await handler(new Request('https://local',{method:'POST',headers,body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}}};
}
(async()=>{
 let checks=0;
 let x=edge({auth:false});assert.equal((await x.run({action:'sync'})).status,401);checks++;
 x=edge({role:'executor'});assert.equal((await x.run({action:'sync'})).status,403);checks++;
 x=edge();assert.equal((await x.run({action:'sync'},{'x-teryaq-webhook':'wrong'})).status,401);checks++;
 x=edge({env:{SHEETS_SYNC_ENABLED:'false'}});assert.equal((await x.run({action:'sync'})).body.skipped,'disabled');assert.equal(x.calls.length,0);checks++;
 x=edge();assert.equal((await x.run({schema:'public',table:'workflow_tasks',type:'UPDATE',record:{id:'other'}},{'x-teryaq-webhook':'w'.repeat(40)})).body.skipped,'outside-test-task');assert.equal(x.calls.length,0);checks++;
 x=edge();const st=await x.run({action:'status'});assert.equal(st.body.configured,true);assert.ok(!JSON.stringify(st.body).includes('private-token'));checks++;
 x=edge();assert.equal((await x.run({action:'sync',task:{id:'evil',title:'Fake'}})).body.ok,true);assert.equal(x.calls[0].task.id,id);assert.equal(x.calls[0].task.name,'Actual task');assert.equal(x.calls[0].task.executors,'Executor — M001');checks++;
 x=edge();assert.equal((await x.run({schema:'public',table:'workflow_tasks',type:'UPDATE',record:{id}},{'x-teryaq-webhook':'w'.repeat(40)})).body.ok,true);assert.equal(x.calls.length,1);checks++;
 x=edge({failDelivery:true});const err=await x.run({action:'sync'});assert.equal(err.status,502);assert.ok(!JSON.stringify(err.body).includes('private remote info'));checks++;
 // Apps Script receiver: reject unauthorized, upsert one row, stale event, formulas.
 const props=new Map([['SYNC_TOKEN','secret'],['SHEET_ID','sheet']]),rows=[Array(12).fill('header')];
 const sheet={getLastRow:()=>rows.length,getRange(r,c,n,w){return {getDisplayValues:()=>rows.slice(r-1,r-1+n).map(row=>row.slice(c-1,c-1+w)),setValues(values){for(let k=0;k<values.length;k++)rows[r-1+k]=values[k];return this}}}};
 const context={PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush(){}},ContentService:{createTextOutput:s=>({setMimeType:()=>s}),MimeType:{JSON:'json'}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(root+'/google-sheets-test/Code.gs','utf8'),context);
 assert.equal(JSON.parse(context.doPost({postData:{contents:JSON.stringify({token:'bad'})}})).ok,false);checks++;
 let task={id:'TEST',status:'in_review',name:'=IMPORTXML("bad")'};
 assert.equal(context.saveTask(task,200).ok,true);assert.equal(rows.length,2);assert.equal(rows[1][4][0],"'");checks++;
 context.saveTask({...task,status:'approved'},300);assert.equal(rows.length,2);assert.equal(rows[1][6],'معتمدة');checks++;
 assert.equal(context.saveTask(task,100).stale,true);assert.equal(rows[1][6],'معتمدة');checks++;
 assert.throws(()=>context.saveTask(task,undefined),/Invalid/);checks++;
 const handlers={};vm.runInNewContext(fs.readFileSync(root+'/sw.js','utf8'),{self:{registration:{scope:'https://teryaq.test/'},location:{origin:'https://teryaq.test'},addEventListener:(name,handler)=>handlers[name]=handler},URL});
 let intercepted=false;handlers.fetch({request:{method:'GET',url:'https://teryaq.test/google-sheets-test/SETUP.html',mode:'navigate'},respondWith(){intercepted=true}});assert.equal(intercepted,false);checks++;
 console.log(`${checks} integration checks passed (mocked Supabase and Sheets).`);
})().catch(e=>{console.error(e);process.exitCode=1});
