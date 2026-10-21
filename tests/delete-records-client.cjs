const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('docs/assets/delete-records.js','utf8');
const ctx={S:{page:'other',event:'e',data:{role:'admin',deleted_service:[{id:'d',visit_name:'QA <name>',checked_in_at:'past'}],shifts:[{id:'s',event_id:'e',duty:'staff',deleted_at:'now',starts_at:'past'}]}},t:(_z,en)=>en,esc:v=>String(v||'').replaceAll('<','&lt;'),label:(_r,v)=>v,roles:[],shiftDetails:r=>({title:r.duty}),stamp:v=>v,visitDateTime:v=>v,staffService:()=>'<active>',staffShifts:()=>'<shifts>',document:{addEventListener(type,fn){if(type==='submit')this.submit=fn;if(type==='click')this.click=fn;}},render(){}};
vm.createContext(ctx);vm.runInContext(code,ctx);
assert(ctx.staffService().includes('Deleted attendance entries (1)'));
assert(ctx.staffService().includes('QA &lt;name>'));
assert(ctx.staffShifts().includes('Deleted shifts (1)'));
assert(ctx.recordDeleteButton('service','id').includes('data-record-operation="delete"'));
assert(ctx.recordDeleteButton('service','id',true).includes('data-record-operation="restore"'));
ctx.S.data.role='staff';assert.equal(ctx.staffService(),'<active>');assert.equal(ctx.staffShifts(),'<shifts>');
for(const f of ['docs/index.html','docs/volunteer.html'])assert(fs.readFileSync(f,'utf8').includes('assets/delete-records.js?v=1.12.3'));
assert(fs.readFileSync('docs/assets/core.js','utf8').includes("['staff','工作人員','Staff']"));
console.log('PASS Admin delete/restore controls, escaped deleted history, restricted staff access and Staff role');

(async()=>{
 const sent=[],undoButton={closest:()=>undoButton},host={append(){},classList:{remove(){}}},button={},form={id:{tagName:'INPUT',value:'QA-SERVICE'},dataset:{},getAttribute:k=>k==='id'?'recordRemovalForm':null,reportValidity:()=>true,querySelector:()=>button};
 let closed=0,refreshed=0,pending;
 Object.assign(ctx,{crypto:{randomUUID:()=> 'qa-undo-request'},toastTimer:0,clearTimeout(){},setTimeout(){return 1;},$:()=>host,FormData:class{constructor(f){return Object.entries(f.values)[Symbol.iterator]();}},visitIdFor:()=> 'qa-request',visitRequest:async(route,body,secure)=>{sent.push({route,body,secure});return {ok:true,version:body.data.target_type==='service'?'3':'2026-10-20T18:00:00Z'};},run:fn=>{pending=fn();return pending;},close:()=>closed++,refresh:async()=>{refreshed++;return true;},toast:()=>{}});
 ctx.document.createElement=()=>({dataset:{}});ctx.S.data.role='admin';
 for(const type of ['service','shift'])for(const operation of ['delete','restore']){
  form.values={id:'QA-ID',target_type:type,operation,version:type==='service'?'2':'2026-10-20T17:00:00Z',reason:' '};
  let prevented=false;ctx.document.submit({target:form,preventDefault(){prevented=true;},stopImmediatePropagation(){}});await pending;
  assert(prevented,'Submission handler ignored form whose hidden id masks form.id');
  assert.equal(sent.at(-1).body.data.operation,operation);assert.equal(sent.at(-1).body.data.target_type,type);assert.equal(sent.at(-1).body.data.reason,'');assert.equal(sent.at(-1).secure,true);assert.equal(typeof sent.at(-1).body.data.version,type==='service'?'number':'string');
  ctx.document.click({target:undoButton,preventDefault(){},stopImmediatePropagation(){}});await pending;
  assert.equal(sent.at(-1).body.data.operation,operation==='delete'?'restore':'delete');assert.equal(sent.at(-1).body.data.reason,'');assert.equal(sent.at(-1).body.data.version,type==='service'?3:'2026-10-20T18:00:00Z');
 }
 assert.equal(sent.length,8);assert.equal(closed,4);assert.equal(refreshed,8);
 console.log('PASS Actual submit handler sends all delete/restore actions despite hidden id shadowing, then refreshes after acknowledgement; blank reasons accepted and Undo uses acknowledged version');
})().catch(e=>{console.error(e);process.exitCode=1;});
