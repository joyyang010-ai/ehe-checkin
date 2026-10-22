// Keep the v1.6 participant/archive regression fixtures. Optional visits supersede its mandatory-shift form.
const fs=require('node:fs');
let source=fs.readFileSync('tests/fixtures/v16-smoke.cjs','utf8');
const start=source.indexOf("for(const url of ['/volunteer.html'");
const finish=source.indexOf('if(width===1024){await login(p,true);',start);
if(start<0||finish<0)throw new Error('Review changed v1.6 fixtures before adapting them.');
const publicChecks=`for(const url of ['/volunteer.html','/?portal=onsite','/?portal=onsite&action=out','/volunteer.html?portal=staff']){await go(p,url);await p.waitForSelector('#quickVisitForm');assert.equal(await p.evaluate(()=>S.page),'onsite');assert.equal(await p.locator('.pageTitle h1').innerText(),'Volunteer / Staff Check-In & Check-Out');assert.equal(await p.locator('#passwordForm').count(),0);assert.equal(await p.locator('#visit-email').inputValue(),'');assert.equal(await p.locator('#quickVisitForm :required').count(),url.includes('action=out')?2:3);assert(await p.locator('.visitSubmit').isEnabled());await layout(p,engine+':'+width+':optional-visit:'+url);}
await p.locator('[data-lang=zh]').click();await p.reload();await p.waitForSelector('#quickVisitForm');assert.equal(await p.evaluate(()=>S.lang),'zh');await p.locator('[data-lang=en]').click();results.push(engine+':'+width+':language-reload');
await go(p,'/?portal=staff');await p.locator(width===390?'#mobileNav [data-nav=onsite]':'.volTopNav [data-nav=onsite]').click();await ready(p);assert(new URL(p.url()).searchParams.get('portal')==='onsite');await p.reload();await p.waitForSelector('#quickVisitForm');assert.equal(await p.locator('#passwordForm').count(),0);results.push(engine+':'+width+':stale-staff-url-fixed');
`;
source=source.slice(0,start)+publicChecks+source.slice(finish);
// Successful writes, retries, missing check-in and unavailable network are independently tested in volunteer-v17.cjs.
new Function('require',source)(require);
