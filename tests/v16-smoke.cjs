// Preserve participant/archive regression fixtures; adapt the intentionally simplified UI.
const fs=require('node:fs');
let source=fs.readFileSync('tests/fixtures/v16-smoke.cjs','utf8');
const start=source.indexOf("for(const url of ['/volunteer.html'");
const finish=source.indexOf('if(width===1024){await login(p,true);',start);
if(start<0||finish<0)throw new Error('Review changed v1.6 fixtures before adapting them.');
const publicChecks=`for(const url of ['/volunteer.html','/?portal=onsite','/?portal=onsite&action=out','/volunteer.html?portal=staff']){await go(p,url);await p.waitForSelector('#quickVisitForm');assert.equal(await p.evaluate(()=>S.page),'onsite');assert.equal(await p.locator('.pageTitle h1').innerText(),'Volunteer / Staff Check-In & Check-Out');assert.equal(await p.locator('#passwordForm').count(),0);assert.equal(await p.locator('#visit-email').inputValue(),'');assert.equal(await p.locator('#quickVisitForm :required').count(),2);assert.equal(await p.locator('#quickVisitForm [name=event_id]').evaluate(e=>e.required),false);assert(await p.locator('.visitSubmit').isEnabled());await layout(p,engine+':'+width+':optional-visit:'+url);}
await p.locator('[data-lang=zh]').click();await p.reload();await p.waitForSelector('#quickVisitForm');assert.equal(await p.evaluate(()=>S.lang),'zh');await p.locator('[data-lang=en]').click();results.push(engine+':'+width+':language-reload');
await go(p,'/?portal=staff');await p.locator(width===390?'#mobileNav [data-nav=onsite]':'.volTopNav [data-nav=onsite]').click();await ready(p);assert(new URL(p.url()).searchParams.get('portal')==='onsite');await p.reload();await p.waitForSelector('#quickVisitForm');assert.equal(await p.locator('#passwordForm').count(),0);results.push(engine+':'+width+':stale-staff-url-fixed');
`;
source=source.slice(0,start)+publicChecks+source.slice(finish);
function adapt(before,after){if(!source.includes(before))throw new Error('Review changed archive fixture: '+before);source=source.replace(before,after);}
// Wait for the app's actual ready state, not an obsolete load event after SPA address normalization.
adapt("await p.goto(base+url);await p.waitForFunction(()=>S.catalogLoaded||S.data);","await p.goto(base+url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>typeof S!=='undefined'&&(S.catalogLoaded||S.data));");
adapt("await p.locator('[data-archive-mode=request]').click();","await p.locator('.uxRowMore > summary').first().click();await p.locator('[data-archive-mode=request]').click();");
adapt("await a.locator('[data-archive-tab=archive]').click();","await a.locator('.uxNavigationMore > summary').click();await a.locator('[data-archive-tab=archive]').click();");
adapt("await p.locator('#categoryFilter').selectOption('archived');","await p.locator('.uxParticipantFilters > summary').click();await p.locator('#categoryFilter').selectOption('archived');");
// No assertions removed: requests, owner review, retained history, restore and safe delete still run.
new Function('require',source)(require);
