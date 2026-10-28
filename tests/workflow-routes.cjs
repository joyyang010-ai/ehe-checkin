// Preserve reservation counts, directory, authorization and navigation fixtures.
const fs=require('node:fs');let source=fs.readFileSync('tests/fixtures/workflow-routes.cjs','utf8');
source=source.replaceAll('#onsiteForm','#quickVisitForm');
const before="assert.equal(await page.locator('#volunteerRows tbody tr').count(),1);";
if(!source.includes(before))throw new Error('Review changed service regression fixture.');
source=source.replace(before,"assert.equal(await page.locator('.visitRecord').count(),0);assert.equal(await page.evaluate(()=>S.data.bookings.length),1);assert.equal(await page.locator('#visitScope').count(),1);");
const nav="assert.equal(await page.locator('.primaryWorkflowNav button').count(),2);";
if(!source.includes(nav))throw new Error('Review changed navigation fixture.');
source=source.replace(nav,"assert.equal(await page.locator('.uxPrimary button').count(),3);assert.equal(await page.locator('.uxPrimary [data-tab=learners]').count(),1);assert.equal(await page.locator('.uxPrimary [data-tab=service]').count(),1);assert.equal(await page.locator('.uxPrimary [data-tab=overview]').count(),1);");
new Function('require',source)(require);
