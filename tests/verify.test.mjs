import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, seededRandom } from '../src/engine.js';
import { verifyRun } from '../server/verify.js';
function play(seed, hz) {
  const game = new Game(seededRandom(seed)); game.start();
  while (game.status !== 'over') {
    if (game.canControl()) {
      const target = game.target, lane = game.cleared < 12 ? target.lane : (target.lane + 1) % 3;
      while (game.lane !== lane) game.move(Math.sign(lane - game.lane));
      if (game.side !== target.side) game.toggleFlip();
    }
    game.update(1 / hz);
  }
  return { ticks: game.tickNumber, inputs: game.inputs, score: game.score };
}
test('server replays real inputs from 30, 60 and 144 Hz clients with identical score', () => {
  for (const hz of [30,60,144]) { const payload = play(926, hz); assert.equal(payload.score,12); assert.deepEqual(verifyRun(926,payload),{score:12,ticks:payload.ticks}); }
});
test('edited score, invented input and unfinished run are rejected', () => {
  const payload=play(42,60);
  assert.throws(()=>verifyRun(42,{...payload,score:999}));
  assert.throws(()=>verifyRun(42,{...payload,score:13}));
  assert.throws(()=>verifyRun(42,{...payload,ticks:payload.ticks-1}));
  assert.throws(()=>verifyRun(42,{...payload,inputs:[{t:1,a:99}]}));
  assert.throws(()=>verifyRun(42,{...payload,inputs:[{t:3,a:0},{t:2,a:0}]}));
});
test('verification rejects unbounded payloads before simulation', () => {
  assert.throws(()=>verifyRun(1,{ticks:36001,inputs:[],score:0}));
  assert.throws(()=>verifyRun(1,{ticks:500,inputs:Array(4001).fill({t:0,a:0}),score:0}));
});
