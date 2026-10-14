// Reuse the original synthetic-data regression fixtures; adapt the deliberately changed master-search flow.
const fs=require('node:fs');
let test=fs.readFileSync('tests/ui-audit.cjs','utf8');
test=test.replaceAll('#deskSearchForm','#p0MasterSearch').replaceAll('[data-desk-person="QA-P2"]','[data-p0-use="QA-P2"]');
const before="await page.locator('#deskNewForm [name=\"name\"]').fill('QA New Learner');";
const after="await page.locator('#p0MasterSearch [name=\"query\"]').fill('QA New Participant');await page.locator('#p0MasterSearch button').click();await page.locator('[data-p0-new]').click();await page.locator('#p0NewParticipant [name=\"name\"]').fill('QA New Participant');";
if(!test.includes(before))throw new Error('Legacy test changed: review P0 adaptation');
test=test.replace(before,after).replaceAll('#deskNewForm button','#p0NewParticipant button');
test=test.replace('for(const width of [1440,768,390])','for(const width of [1440,1024,768,390])');
test=test.replace('async function audit(page,name){',`async function audit(page,name){
 if(await page.locator('.p0Metrics').count()){
  const v=await page.evaluate(()=>participantSessionStats());
  for(const k of ['registered','checked','remaining','walkins'])assert.equal(await page.locator('[data-metric="'+k+'"]').innerText(),String(v[k]));
  assert.equal(v.remaining,Math.max(0,v.registered-v.checked));
  assert.equal(await page.locator('[data-metric="rate"]').innerText(),v.rate===null?'\u2014':v.rate+'%');
  assert(!/learner/i.test(await page.locator('.pageTitle h1').innerText()));
 }
`);
new Function('require',test)(require);
