const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('docs/assets/volunteer-visits.js','utf8');
const code=source.slice(source.indexOf('function switchVisitKind'),source.indexOf('function visitShiftField',source.indexOf('function switchVisitKind')));
const values={name:'Fictional Senior Volunteer',email:'qa@example.invalid',event_id:'QA-E',role:'staff',shift_id:'QA-S'};
let renders=0,shiftArgs;const inputs=Object.fromEntries(['name','email','event_id','role'].map(k=>[k,{value:''}])),details={open:false},shift={};
const form={},next={elements:{namedItem:k=>inputs[k]},querySelector:()=>details};
const ctx={S:{kind:'in',busy:false},FormData:class{constructor(){return Object.entries(values)}},$:q=>q==='#visitShiftField'?shift:renders?next:form,render:()=>renders++,visitShiftField:(...args)=>{shiftArgs=args;return 'QA shift'}};
vm.createContext(ctx);vm.runInContext(code,ctx);ctx.switchVisitKind('out');assert.equal(ctx.S.kind,'out');assert.equal(renders,1);for(const k of Object.keys(inputs))assert.equal(inputs[k].value,values[k]);assert.deepEqual(shiftArgs,['QA-E','QA-S']);assert(details.open);ctx.switchVisitKind('out');assert.equal(renders,1);ctx.S.busy=true;ctx.switchVisitKind('in');assert.equal(ctx.S.kind,'out');assert(!code.includes('Storage'));
console.log('PASS Check-in mode switches preserve identity/context without storage and respect busy state');

assert(fs.readFileSync('docs/assets/navigation.js','utf8').includes("if($('#quickVisitForm')){switchVisitKind"));
