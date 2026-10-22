import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const checks=[],errors=[];
try{
 const context=await browser.newContext(),page=await context.newPage();await context.addInitScript(()=>localStorage.setItem('usb-nickname','联网测试'));page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/runs',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'暂时无法连接'})}));await page.goto('http://127.0.0.1:8357/?qa=1');await page.locator('#connection-modal').waitFor({state:'visible'});
 assert.equal((await page.evaluate(()=>window.__USB_GAME__.snapshot())).paused,true);
 await page.unroute('**/api/runs');await page.click('#retry-connection-btn');await page.waitForFunction(()=>document.querySelector('#loading').hidden&&window.__USB_GAME__.snapshot().status==='running'&&!window.__USB_GAME__.snapshot().paused);checks.push('Connection failure never starts an unverified run; retry recovers');await context.close();
 { const retryContext=await browser.newContext();await retryContext.addInitScript(()=>localStorage.setItem('usb-nickname','自动重试测试'));const retryPage=await retryContext.newPage();let attempts=0;retryPage.on('pageerror',e=>errors.push(e.message));await retryPage.route('**/api/scores',route=>++attempts===1?route.fulfill({status:503,contentType:'application/json',body:'{"error":"temporary"}'}):route.continue());await retryPage.goto('http://127.0.0.1:8357/?qa=1');await retryPage.waitForFunction(()=>document.querySelector('#loading').hidden);const r=await retryPage.evaluate(()=>window.__USB_GAME__.snapshot());let lane=r.lane;const wrong=(r.targetLane+1)%3;while(lane!==wrong){await retryPage.keyboard.press(lane<wrong?'ArrowRight':'ArrowLeft');lane+=lane<wrong?1:-1;}await retryPage.waitForFunction(()=>document.querySelector('#submit-status').textContent.includes('已自动计入'),{},{timeout:15000});assert.equal(attempts,2);checks.push('Transient save failure automatically retries without reload or name input');await retryContext.close(); }
 const offline=await browser.newContext();await offline.addInitScript(()=>localStorage.setItem('usb-nickname','离线玩家'));await offline.setOffline(true);const p=await offline.newPage();const network=[];p.on('request',r=>{if(r.url().startsWith('http'))network.push(r.url());});p.on('pageerror',e=>errors.push(e.message));await p.goto(pathToFileURL(path.resolve('插个U盘_离线版.html')).href+'?qa=1');await p.waitForFunction(()=>document.querySelector('#loading').hidden);
 const s=await p.evaluate(()=>window.__USB_GAME__.snapshot()),wrong=(s.targetLane+1)%3;let lane=s.lane;while(lane!==wrong){await p.keyboard.press(lane<wrong?'ArrowRight':'ArrowLeft');lane+=lane<wrong?1:-1;}
 await p.waitForFunction(()=>window.__USB_GAME__.snapshot().status==='over');await p.waitForFunction(()=>document.querySelector('#submit-status').textContent.includes('已自动保存'));await p.click('#result-board-btn');await p.waitForFunction(()=>document.querySelectorAll('#board-rows tr').length===1);assert.equal(await p.locator('#board-title').textContent(),'本机排行榜');assert.deepEqual(network,[]);checks.push('Offline HTML automatically saves local scores and clearly labels a local board without network requests');
 assert.deepEqual(errors,[]);await offline.close();
}catch(error){errors.push(String(error));console.error(error);process.exitCode=1;}
finally{await writeFile('qa/leaderboard-edge-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,errors},null,2));console.log({checks,errors});await browser.close();}
