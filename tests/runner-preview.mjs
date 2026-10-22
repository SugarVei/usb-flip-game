import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
await mkdir('qa', { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('ERROR', e.message)); page.on('console', m => { if (['error','warning'].includes(m.type())) console.log(m.type(), m.text().slice(0,250)); });
await page.goto('http://127.0.0.1:8357/?qa=1'); await page.waitForFunction(() => document.querySelector('#loading').hidden);
await page.screenshot({path:'qa/runner-falling.png'}); await page.waitForTimeout(700); await page.screenshot({path:'qa/runner-desktop.png'});
let s=await page.evaluate(()=>window.__USB_GAME__.snapshot());
while(s.lane!==s.targetLane){await page.keyboard.press(s.lane<s.targetLane?'ArrowRight':'ArrowLeft');s=await page.evaluate(()=>window.__USB_GAME__.snapshot());}
if(s.side!==s.targetSide) await page.keyboard.press('Space');
await page.waitForFunction(()=>window.__USB_GAME__.snapshot().cleared===1,{timeout:10000}); await page.waitForTimeout(450);
await page.screenshot({path:'qa/runner-success.png'}); console.log(JSON.stringify(await page.evaluate(()=>({game:window.__USB_GAME__.snapshot(),scene:window.__USB_GAME__.metrics()}))));
await page.setViewportSize({width:390,height:844}); await page.reload(); await page.waitForFunction(()=>document.querySelector('#loading').hidden); await page.waitForTimeout(1000); await page.screenshot({path:'qa/runner-mobile.png'});
await browser.close();
