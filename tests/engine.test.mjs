import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, LANES, speedForClears, DROP_DURATION, BASE_SPEED } from '../src/engine.js';
function seeded(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function advance(g, seconds, hz=120) { for(let t=0;t<seconds-1e-8;t+=1/hz) g.update(Math.min(1/hz,seconds-t)); }
function until(g, condition, limit=20) { for(let t=0;t<limit&&!condition();t+=1/120)g.update(1/120);assert.ok(condition(),'Condition did not occur'); }
function solve(g) { if(!g.canControl())return;const target=g.target;if(!target)return;while(g.lane!==target.lane)g.move(Math.sign(target.lane-g.lane));if(g.side!==target.side)g.toggleFlip(); }
test('first computer drops onto the route; future computers are queued',()=>{
  const g=new Game(seeded(5));g.start();assert.equal(g.status,'running');assert.equal(g.target.state,'falling');assert.equal(g.obstacles.length,3);
  advance(g,DROP_DURATION+.1);assert.equal(g.target.state,'landed');assert.ok(g.distance>0);assert.equal(g.obstacles[1].state,'waiting');
});
test('success scatters the computer while position, orientation and forward travel continue',()=>{
  const g=new Game(seeded(8));g.start();solve(g);const lane=g.lane,side=g.side,id=g.target.id;
  until(g,()=>g.cleared===1);assert.equal(g.status,'running');assert.equal(g.obstacles.find(o=>o.id===id).state,'breaking');
  const d=g.distance;advance(g,.4);assert.ok(g.distance>d);assert.equal(g.lane,lane);assert.equal(g.side,side);assert.equal(g.score,1);assert.notEqual(g.target.id,id);
});
test('a wrong side produces an intact crash then an immediate game over',()=>{
  const g=new Game(seeded(19));g.start();const t=g.target;g.lane=t.lane;g.x=LANES[t.lane];g.side=1-t.side;g.angle=g.side*Math.PI;
  until(g,()=>g.status==='crash');assert.equal(g.result.reason,'orientation');assert.equal(t.state,'crashed');assert.equal(g.cleared,0);
  const d=g.distance;advance(g,.8);assert.equal(g.status,'over');assert.equal(g.distance,d);assert.equal(t.state,'crashed');assert.equal(g.target?.id,2);
});
test('a correct side with a wrong lane also ends the game without scattering',()=>{
  const g=new Game(seeded(13));g.start();const t=g.target;g.lane=(t.lane+1)%3;g.x=LANES[g.lane];g.side=t.side;g.angle=t.side*Math.PI;
  until(g,()=>g.status==='crash');assert.equal(g.result.reason,'position');assert.equal(t.state,'crashed');advance(g,1);assert.equal(g.status,'over');
});
test('late logical inputs cannot bypass unfinished physical movement or half turns',()=>{
  const g=new Game(seeded(16));g.start();g.target.lane=0;g.target.side=1;g.lane=1;g.side=0;g.angle=0;
  until(g,()=>g.target.contactDistance-g.distance<.04);g.move(-1);g.toggleFlip();until(g,()=>g.status==='crash');assert.equal(g.result.positionOK,false);assert.equal(g.result.sideOK,false);
});
test('pause freezes forward travel, falling computers, lateral spring and rotation',()=>{
  const g=new Game(seeded(3));g.start();g.move(-1);g.toggleFlip();advance(g,.2);g.togglePause(true);const before=g.snapshot();advance(g,10);assert.deepEqual(g.snapshot(),before);g.togglePause(false);advance(g,.2);assert.ok(g.distance>before.distance);
});
test('continuous play exceeds ten computers, always accelerates, and bounds queue/history',()=>{
  const g=new Game(seeded(42));g.start();let previousDistance=0,previousSpeed=0;
  for(let n=1;n<=30;n++){
    until(g,()=>g.canControl());solve(g);until(g,()=>g.cleared===n);
    assert.equal(g.status,'running');assert.ok(g.distance>previousDistance);assert.ok(g.speed>=previousSpeed);assert.ok(g.obstacles.length<=4);assert.ok(g.history.length<=50);
    previousDistance=g.distance;previousSpeed=g.speed;
  }
  assert.equal(g.cleared,30);assert.ok(g.speed>4);assert.equal(g.history.length,30);
});
test('every generated computer changes lane; all orientations are represented',()=>{
  const g=new Game(seeded(27));g.start();const all=[];
  for(let i=0;i<334;i++){all.push(...g.obstacles.map(o=>({...o})));const last=g.obstacles.at(-1);g.distance=last.contactDistance;g.obstacles=[];g.fillQueue();}
  for(let i=1;i<all.length;i++)assert.notEqual(all[i].lane,all[i-1].lane);
  assert.equal(new Set(all.map(o=>o.lane)).size,3);assert.equal(new Set(all.map(o=>o.side)).size,2);
});
test('30, 60 and 144 Hz produce equivalent travel and movement',()=>{
  const games=[30,60,144].map(hz=>{const g=new Game(seeded(7));g.start();solve(g);advance(g,4,hz);return g;});
  for(const g of games.slice(1)){assert.ok(Math.abs(g.distance-games[0].distance)<.00001);assert.ok(Math.abs(g.x-games[0].x)<.00001);assert.equal(g.angle,games[0].angle);}
});
test('starting speed doubles and every success compounds speed by exactly five percent',()=>{
  assert.equal(BASE_SPEED,2.76*2);assert.equal(speedForClears(0),1);
  for(let i=1;i<=100;i++)assert.ok(Math.abs(speedForClears(i)/speedForClears(i-1)-1.05)<1e-12);
  assert.ok(Math.abs(speedForClears(10)-1.628894626777442)<1e-12);
});
test('restart clears failure, travel and acceleration; lane and flip bounds stay valid',()=>{
  const g=new Game(seeded(17));g.start();for(let i=0;i<15;i++)g.move(-1);assert.equal(g.lane,0);for(let i=0;i<15;i++)g.move(1);assert.equal(g.lane,2);assert.equal(g.toggleFlip(),true);assert.equal(g.toggleFlip(),false);
  advance(g,.4);assert.equal(g.toggleFlip(),true);g.start();assert.equal(g.distance,0);assert.equal(g.cleared,0);assert.equal(g.velocity,5.52);assert.equal(g.side,0);assert.equal(g.status,'running');
});
