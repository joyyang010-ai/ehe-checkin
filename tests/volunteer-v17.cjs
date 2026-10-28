// Preserve retry, false-success, duplicate, correction and participant regression fixtures.
const fs=require('node:fs');let source=fs.readFileSync('tests/fixtures/volunteer-v17.cjs','utf8');
function adapt(before,after){if(!source.includes(before))throw new Error('Review changed volunteer fixture: '+before);source=source.replace(before,after);}
// v1.18 intentionally allows no event. Name/email stay required; the same save/retry flow tests this case.
adapt("assert.equal(await page.locator('#quickVisitForm :required').count(),3);await page.locator('#visit-name').fill('QA missing event');await page.locator('#visit-email').fill('missing@example.invalid');await page.locator('.visitSubmit').click();assert.equal(posts.length,0);","assert.equal(await page.locator('#quickVisitForm :required').count(),2);assert.equal(await page.locator('#quickVisitForm [name=event_id]').evaluate(e=>e.required),false);assert.equal(await page.locator('#quickVisitForm [name=event_id]').inputValue(),'');assert.equal(posts.length,0);");
adapt("assert.equal(posts.at(-1).event_id,ev.id);","assert.equal(posts.at(-1).event_id,null);assert.equal(posts.at(-1).data.unassigned_event,true);");
adapt("['#sectionNav .primaryWorkflowNav>button','.visitSubmit']","['#sectionNav .uxPrimary>button','#sectionNav .uxVolunteerNav>button','.visitSubmit']");
new Function('require',source)(require);
