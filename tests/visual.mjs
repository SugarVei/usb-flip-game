import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const errors=[],checks=[];
const snap=p=>p.evaluate(()=>window.__USB_GAME__.snapshot());
async function load(p){p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>localStorage.setItem('usb-nickname','画面测试'));await p.goto('http://127.0.0.1:8357/?qa=1');await p.waitForFunction(()=>document.querySelector('#loading').hidden);}
async function move(p,lane,touch=false){await p.waitForFunction(()=>!document.querySelector('#left-btn').disabled);let s=await snap(p);while(s.lane!==lane){const id=s.lane<lane?'#right-btn':'#left-btn';if(touch)await p.tap(id);else await p.click(id);s=await snap(p);}}
async function orient(p,side,touch=false){const s=await snap(p);if(s.side!==side){if(touch)await p.tap('#flip-btn');else await p.click('#flip-btn');await p.waitForTimeout(380);}}
try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const mobile=await context.newPage();await load(mobile);
  let s=await snap(mobile);await move(mobile,s.targetLane,true);await orient(mobile,s.targetSide,true);
  await mobile.waitForFunction(()=>window.__USB_GAME__.snapshot().cleared===1,{timeout:10000});await mobile.waitForTimeout(350);await mobile.screenshot({path:'design/连续模式_手机成功散架.png'});assert.equal((await snap(mobile)).status,'running');checks.push('Mobile actual touch buttons complete insertion, scatter and continuous travel');
  s=await snap(mobile);await move(mobile,(s.targetLane+1)%3,true);await orient(mobile,s.targetSide,true);
  await mobile.waitForFunction(()=>window.__USB_GAME__.snapshot().status==='crash',{timeout:10000});await mobile.waitForTimeout(160);await mobile.screenshot({path:'design/连续模式_手机碰撞.png'});
  const view=await mobile.evaluate(()=>window.__USB_GAME__.metrics());assert.ok(view.computers.some(o=>o.state==='crashed'&&o.intact&&!o.exploded));
  await mobile.waitForFunction(()=>window.__USB_GAME__.snapshot().status==='over');await mobile.waitForTimeout(300);await mobile.screenshot({path:'design/连续模式_手机失败.png'});checks.push('Mobile collision remains intact; final failure card is visible');
  await context.close();
  const desktop=await browser.newPage({viewport:{width:1440,height:900}});await load(desktop);s=await snap(desktop);await move(desktop,(s.targetLane+1)%3);await orient(desktop,s.targetSide);
  await desktop.waitForFunction(()=>window.__USB_GAME__.snapshot().status==='over',{timeout:10000});await desktop.waitForTimeout(300);await desktop.screenshot({path:'design/连续模式_游戏失败.png'});checks.push('Desktop final failure modal captured after animation');
  assert.equal(errors.length,0);await writeFile('qa/final-visual-results.json',JSON.stringify({checkedAt:new Date().toISOString(),mode:'continuous-runner',checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
