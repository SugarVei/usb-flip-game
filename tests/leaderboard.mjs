// API integration fixtures are restricted to the local D1 database.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Game, seededRandom } from '../src/engine.js';
const origin='http://127.0.0.1:8357',checks=[];
async function api(path,data){const r=await fetch(origin+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json()};}
const pass=name=>{checks.push(name);console.log('PASS',name);};
try{
 const baseline=(await api('/api/leaderboard?mode=all')).data.total,bestBefore=(await api('/api/leaderboard?mode=best')).data.total,playerId=crypto.randomUUID(),fixtures=[];
 for(let i=0;i<22;i++){
  const run=await api('/api/runs',{playerId});assert.equal(run.status,201);const game=new Game(seededRandom(run.data.seed));game.start();const wrong=(game.target.lane+1)%3;while(game.lane!==wrong)game.move(Math.sign(wrong-game.lane));while(game.status!=='over')game.update(1/120);
  fixtures.push({runId:run.data.id,nickname:i===0?"O'Reilly":'接口测试'+i,score:0,ticks:game.tickNumber,inputs:game.inputs});
 }
 await new Promise(resolve=>setTimeout(resolve,3400));
 assert.equal((await api('/api/scores',{...fixtures[0],score:100})).status,400);assert.equal((await api('/api/scores',{...fixtures[0],nickname:'<script>'})).status,400);assert.equal((await api('/api/scores',{...fixtures[0],nickname:'一'.repeat(17)})).status,400);pass('Forged score and invalid nickname are rejected');
 for(const fixture of fixtures)assert.equal((await api('/api/scores',fixture)).status,201);assert.equal((await api('/api/scores',fixtures[0])).status,200);pass('Verified runs save and duplicate retries are idempotent');
 const all=(await api('/api/leaderboard?mode=all')).data,best=(await api('/api/leaderboard?mode=best')).data;assert.equal(all.total,baseline+22);assert.equal(best.total,bestBefore+1);pass('All attempts are retained; personal best groups one player');
 const page=(await api('/api/leaderboard?mode=all&offset='+baseline)).data;assert.equal(page.rows.length,20);assert.equal(page.rows[0].rank,baseline+1);assert.ok(page.rows.some(row=>row.nickname==="O'Reilly"));const next=(await api('/api/leaderboard?mode=all&offset='+page.nextOffset)).data;assert.equal(next.rows.length,2);assert.equal(new Set([...page.rows,...next.rows].map(row=>row.id)).size,22);pass('Pagination returns all records and SQL-safe nicknames');
 await writeFile('qa/leaderboard-results.json',JSON.stringify({checkedAt:new Date().toISOString(),checks,errors:[],storage:'Local Wrangler D1 only'},null,2));
}catch(error){console.error(error);process.exitCode=1;}
