import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxy } from '../server/proxy.js';
const config={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'fixture-anon'};
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(text){this.value=JSON.parse(text);}};}
test('proxy passes route, pagination and app JWT without forwarding caller authorization',async()=>{
 const res=response();let called;await proxy({method:'GET',url:'/api/leaderboard?mode=all&offset=20&extra=ignored',headers:{host:'game.example',authorization:'caller-token'}},res,'leaderboard',config,async(url,options)=>{called={url:String(url),options};return Response.json({rows:[],total:0});});
 assert.equal(called.url,'https://example.supabase.co/functions/v1/usb-game-api/leaderboard?mode=all&offset=20');assert.equal(called.options.headers.Authorization,'Bearer fixture-anon');assert.equal(res.statusCode,200);assert.equal(res.headers['Cache-Control'],'no-store');
});
test('proxy preserves score validation errors from the verified backend',async()=>{
 const res=response();await proxy({method:'POST',url:'/api/scores',headers:{host:'game.example','content-type':'application/json'},body:{score:999}},res,'scores',config,async()=>Response.json({error:'成绩与本局操作不一致'},{status:400}));assert.equal(res.statusCode,400);assert.match(res.value.error,/成绩/);
});
test('proxy rejects cross-origin writes, oversized input, invalid routes and missing config',async()=>{
 const cases=[['scores',{method:'POST',url:'/api/scores',headers:{origin:'https://other.example',host:'game.example','content-type':'application/json'},body:{}},config,403],['scores',{method:'POST',url:'/api/scores',headers:{host:'game.example','content-type':'application/json'},body:'a'.repeat(100001)},config,413],['unknown',{method:'GET'},config,404],['leaderboard',{method:'GET'}, {},503]];
 for(const [route,req,env,status]of cases){const res=response();await proxy(req,res,route,env,()=>{throw new Error('must not fetch');});assert.equal(res.statusCode,status);}
});
