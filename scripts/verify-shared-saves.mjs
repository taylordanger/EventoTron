import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.EVENTOTRON_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.EVENTOTRON_QA_URL || '';
const target=new URL(base);
if(process.env.EVENTOTRON_ISOLATED_QA !== '1' || !['127.0.0.1','localhost'].includes(target.hostname) || ['','3000','3001','3101'].includes(target.port)) throw new Error('Use an explicitly isolated local QA database/port, never the daily-use server.');

async function api(path, method='GET',body,status=200){
 const r=await fetch(base+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;
}
const backup=JSON.parse(await fs.readFile(process.env.EVENTOTRON_QA_BACKUP,'utf8'));
backup.data.calendarSources=[];backup.data.calendarEvents=[];
backup.data.settings=backup.data.settings.map(s=>({...s,payload:{...s.payload,calendarSources:[]}}));
await api('/api/workspace-backup','POST',backup);
for(const app of ['tabletron','foodotron','scheduluotron']){
 const path=`/api/event-app-state?eventId=staff-meeting&app=${app}`;
 const original=await api(path);
 await api(path,'PUT',{payload:original.payload},428);
 const one=structuredClone(original.payload);const two=structuredClone(original.payload);
 if(app==='tabletron'){one.events.find(e=>e.id==='staff-meeting').staffing='Editor A';two.events.find(e=>e.id==='staff-meeting').staffing='Editor B';}
 if(app==='foodotron'){one.meals[0].name='Editor A';two.meals[0].name='Editor B';}
 if(app==='scheduluotron'){one.blocks[0].title='Editor A';two.blocks[0].title='Editor B';}
 const first=await api(path,'PUT',{payload:one,expectedUpdatedAt:original.updatedAt});
 await api(path,'PUT',{payload:two,expectedUpdatedAt:original.updatedAt},409);
 assert.deepEqual((await api(path)).payload,one);
 const results=await Promise.all([fetch(base+path,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({payload:one,expectedUpdatedAt:first.updatedAt})}),fetch(base+path,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({payload:two,expectedUpdatedAt:first.updatedAt})})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const current=await api(path);const invalid=structuredClone(current.payload);
 if(app==='scheduluotron'){
   invalid.blocks=[{...invalid.blocks[0],id:'duplicate'},{...invalid.blocks[0],id:'duplicate'}];
   await api(path,'PUT',{payload:invalid,expectedUpdatedAt:current.updatedAt},500);
   assert.deepEqual(await api(path),current);
 }
 await api(path,'DELETE',{expectedUpdatedAt:original.updatedAt},409);
 console.log(app+': stale save/delete, simultaneous writers, transactional rollback passed');
}
let settings=await api('/api/settings');
await api('/api/settings','PUT',{payload:settings.payload},428);
await api('/api/settings','PUT',{payload:{...settings.payload,venueName:'Editor A venue'},expectedUpdatedAt:settings.updatedAt});
await api('/api/settings','PUT',{payload:{...settings.payload,venueName:'Editor B venue',calendarSources:[{id:'bad-stale',name:'Must not appear',provider:'ical',url:'https://example.com/test.ics',color:'#75ff47',enabled:false,syncMinutes:15}]},expectedUpdatedAt:settings.updatedAt},409);
assert.equal((await api('/api/settings')).payload.venueName,'Editor A venue');
assert.equal((await api('/api/calendar-sources')).sources.length,0);
console.log('Settings: stale save rolled back its calendar writes');
await api('/api/workspace-backup','POST',backup);

const browser=await chromium.launch({headless:true,...(process.env.EVENTOTRON_CHROME_PATH ? {executablePath:process.env.EVENTOTRON_CHROME_PATH} : {})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const a=await context.newPage();const b=await context.newPage();
 const errors=[];a.on('pageerror',e=>errors.push(e.message));b.on('pageerror',e=>errors.push(e.message));
 await a.goto(base+'/scheduluotron?event=staff-meeting');
 await a.waitForTimeout(1800);
 await b.goto(base+'/scheduluotron?event=staff-meeting');
 await b.waitForTimeout(1800);
 // A's revision is now stale if B initialized updated event metadata; wait for a stable baseline.
 await a.reload();await a.waitForTimeout(1800);
 console.log('Schedule fields',await a.locator('input').evaluateAll(els=>els.map(e=>({value:e.value,placeholder:e.placeholder}))));
 const fieldA=a.locator('input').filter({visible:true}).first();
 await fieldA.fill('Pilot event edited by A');await a.waitForTimeout(1100);
 const fieldB=b.locator('input').filter({visible:true}).first();
 await fieldB.fill('Pilot event edited by B');
 await b.locator('.shared-save-recovery').waitFor();
 assert.match(await b.locator('.shared-save-recovery').innerText(),/Another staff member/);
 assert.equal(await fieldB.inputValue(),'Pilot event edited by B');
 await b.screenshot({path:'/private/tmp/team-conflict.png',fullPage:true});
 await b.reload();await b.locator('.shared-save-recovery').waitFor();
 assert.match(await b.locator('.shared-save-recovery').innerText(),/unsaved draft/);
 await b.getByRole('button',{name:'RESTORE MY DRAFT'}).click();
 await b.waitForTimeout(1000);
 assert.equal(await fieldB.inputValue(),'Pilot event edited by B');
 assert.match(await b.locator('.shared-save-recovery').innerText(),/Another staff member/);
 await b.getByRole('button',{name:'KEEP DRAFT & LOAD SERVER COPY'}).click();
 await b.waitForTimeout(500);
 assert.equal(await fieldB.inputValue(),'Pilot event edited by A');
 assert.equal(await b.locator('.shared-save-recovery').count(),0);
 await b.route('**/api/event-app-state?**',route=>route.request().method()==='PUT'?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Network test offline'})}):route.continue());
 await fieldB.fill('Offline draft retained');await b.locator('.shared-save-recovery').waitFor();
 assert.equal(await fieldB.inputValue(),'Offline draft retained');
 await b.unroute('**/api/event-app-state?**');await b.getByRole('button',{name:'RETRY SAVE',exact:true}).click();await b.waitForTimeout(700);
 assert.equal((await api('/api/event-app-state?eventId=staff-meeting&app=scheduluotron')).payload.eventName,'Offline draft retained');
 await b.reload();await b.waitForTimeout(1000);assert.equal(await fieldB.inputValue(),'Offline draft retained');
 assert.deepEqual(errors,[]);
 console.log('Browser: conflict/draft recovery, stale recovery rejection, winner reload, offline draft/retry and reopen persistence passed');
}finally{await browser.close();}
