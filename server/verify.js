import { Game, seededRandom } from '../src/engine.js';
export function verifyRun(seed, payload) {
  const { ticks, inputs, score } = payload;
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > 36000 || !Number.isInteger(score) || score < 0 || score > 500 || !Array.isArray(inputs) || inputs.length > 4000) throw new Error('成绩格式不正确');
  const game = new Game(seededRandom(seed)); game.start(); let previous = 0;
  for (const input of inputs) {
    if (!input || !Number.isInteger(input.t) || input.t < previous || input.t > ticks || ![-1, 0, 1].includes(input.a)) throw new Error('操作记录不正确');
    while (game.tickNumber < input.t && game.status !== 'over') game.update(1 / 120);
    if (game.tickNumber !== input.t || !(input.a === 0 ? game.toggleFlip() : game.move(input.a))) throw new Error('操作记录无法核验');
    previous = input.t;
  }
  while (game.tickNumber < ticks && game.status !== 'over') game.update(1 / 120);
  if (game.tickNumber !== ticks || game.status !== 'over' || game.score !== score) throw new Error('成绩与本局操作不一致');
  return { score: game.score, ticks: game.tickNumber };
}
