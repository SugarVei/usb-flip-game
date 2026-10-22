// src/engine.js
var LANES = [-2.05, 0, 2.05];
var TAU = Math.PI * 2;
var COMPUTER_GAP = 14.4;
var BASE_SPEED = 5.52;
var DROP_DISTANCE = 21;
var DROP_DURATION = 0.78;
var clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
var smooth = (t) => (t = clamp(t, 0, 1), t * t * (3 - 2 * t));
var orientationError = (angle, side) => Math.abs(Math.atan2(Math.sin(angle - side * Math.PI), Math.cos(angle - side * Math.PI)));
function spring(x, v, target, dt, omega = 21) {
  const offset = x - target, c = v + omega * offset, e = Math.exp(-omega * dt);
  return [target + (offset + c * dt) * e, (v - omega * c * dt) * e];
}
function speedForClears(clears) {
  return 1.05 ** clears;
}
function seededRandom(seed) {
  return () => {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    return seed / 4294967296;
  };
}
var Game = class {
  constructor(random = Math.random) {
    this.random = random;
    this.status = "ready";
    this.events = [];
  }
  start() {
    this.status = "running";
    this.paused = false;
    this.score = 0;
    this.cleared = 0;
    this.distance = 0;
    this.totalTime = 0;
    this.phaseTime = 0;
    this.tickNumber = 0;
    this.accumulator = 0;
    this.inputs = [];
    this.speed = 1;
    this.velocity = BASE_SPEED;
    this.lane = 1;
    this.x = 0;
    this.vx = 0;
    this.angle = 0;
    this.side = 0;
    this.flip = null;
    this.dockingUntil = 0;
    this.obstacles = [];
    this.history = [];
    this.nextId = 1;
    this.nextContact = COMPUTER_GAP;
    this.previousLane = -1;
    this.result = null;
    this.events = [];
    this.fillQueue();
    this.updateDrops(0);
    this.emit("start");
  }
  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }
  drainEvents() {
    return this.events.splice(0);
  }
  fillQueue() {
    while (this.nextContact - this.distance <= COMPUTER_GAP * 3 + 0.01) {
      const lane = this.previousLane < 0 ? Math.floor(this.random() * 3) : (this.previousLane + 1 + Math.floor(this.random() * 2)) % 3;
      const obstacle = { id: this.nextId++, contactDistance: this.nextContact, lane, side: this.random() < 0.5 ? 0 : 1, state: "waiting", dropAge: 0, dropDuration: Math.min(DROP_DURATION, COMPUTER_GAP / (BASE_SPEED * speedForClears(this.cleared)) * 0.7), landedAt: null, resolvedAt: null };
      this.previousLane = lane;
      this.obstacles.push(obstacle);
      this.nextContact += COMPUTER_GAP;
      this.emit("spawn", { id: obstacle.id });
    }
  }
  get target() {
    return this.obstacles?.find((o) => o.state === "waiting" || o.state === "falling" || o.state === "landed");
  }
  canControl() {
    return this.status === "running" && !this.paused && this.totalTime >= this.dockingUntil;
  }
  move(direction) {
    if (!this.canControl()) return false;
    const lane = clamp(this.lane + direction, 0, 2);
    if (lane === this.lane) return false;
    this.inputs.push({ t: this.tickNumber, a: Math.sign(direction) });
    this.lane = lane;
    this.emit("move");
    return true;
  }
  toggleFlip() {
    if (!this.canControl() || this.flip) return false;
    this.side = 1 - this.side;
    this.inputs.push({ t: this.tickNumber, a: 0 });
    this.flip = { start: this.angle, end: this.angle + Math.PI, t: 0 };
    this.emit("flip");
    return true;
  }
  togglePause(force) {
    if (!["running", "crash"].includes(this.status)) return;
    this.paused = force ?? !this.paused;
    this.emit("pause", { paused: this.paused });
  }
  update(dt) {
    if (this.paused || !["running", "crash"].includes(this.status) || !Number.isFinite(dt) || dt <= 0) return;
    this.accumulator += Math.min(dt, 0.25);
    while (this.accumulator + 1e-10 >= 1 / 120) {
      this.accumulator -= 1 / 120;
      this.tickNumber++;
      this.tick(1 / 120);
      if (this.status === "over") break;
    }
  }
  updateDrops(dt) {
    for (const o of this.obstacles) {
      if (o.state === "waiting" && o.contactDistance - this.distance <= DROP_DISTANCE) {
        o.state = "falling";
        o.dropAge = 0;
        this.emit("drop", { id: o.id });
      }
      if (o.state === "falling") {
        o.dropAge = Math.min(o.dropAge + dt, o.dropDuration);
        if (o.dropAge >= o.dropDuration) {
          o.state = "landed";
          o.landedAt = this.totalTime;
          this.emit("land", { id: o.id });
        }
      }
    }
  }
  tick(dt) {
    this.totalTime += dt;
    if (this.status === "crash") {
      this.phaseTime += dt;
      if (this.phaseTime >= 0.68) {
        this.status = "over";
        this.emit("over", this.result);
      }
      return;
    }
    [this.x, this.vx] = spring(this.x, this.vx, LANES[this.lane], dt);
    if (this.flip) {
      this.flip.t += dt;
      this.angle = this.flip.start + (this.flip.end - this.flip.start) * smooth(this.flip.t / 0.34);
      if (this.flip.t >= 0.34) {
        this.angle = this.flip.end % TAU;
        this.flip = null;
      }
    }
    this.speed = speedForClears(this.cleared);
    this.velocity += (BASE_SPEED * this.speed - this.velocity) * (1 - Math.exp(-dt * 2.5));
    this.distance += this.velocity * dt;
    this.updateDrops(dt);
    const target = this.target;
    if (target && this.distance >= target.contactDistance) this.resolve(target);
    if (this.status === "running") {
      this.obstacles = this.obstacles.filter((o) => this.distance - o.contactDistance < 13);
      this.fillQueue();
    }
  }
  resolve(obstacle) {
    const positionOK = Math.abs(this.x - LANES[obstacle.lane]) <= 0.31;
    const sideOK = orientationError(this.angle, obstacle.side) < 0.12;
    const landed = obstacle.state === "landed";
    const success = positionOK && sideOK && landed;
    const reason = !positionOK ? "position" : !sideOK ? "orientation" : !landed ? "landing" : "success";
    obstacle.state = success ? "breaking" : "crashed";
    obstacle.resolvedAt = this.totalTime;
    this.result = { id: obstacle.id, success, reason, positionOK, sideOK, distance: this.distance };
    this.history.push({ ...this.result });
    if (this.history.length > 50) this.history.shift();
    if (success) {
      this.cleared++;
      this.score = this.cleared;
      this.speed = speedForClears(this.cleared);
      this.dockingUntil = this.totalTime + 0.14;
      this.emit("success", this.result);
    } else {
      this.status = "crash";
      this.phaseTime = 0;
      this.flip = null;
      this.emit("fail", this.result);
    }
  }
  snapshot() {
    const target = this.target;
    return {
      status: this.status,
      paused: this.paused,
      score: this.score,
      cleared: this.cleared,
      distance: this.distance,
      totalTime: this.totalTime,
      tickNumber: this.tickNumber,
      speed: this.speed,
      velocity: this.velocity,
      lane: this.lane,
      x: this.x,
      side: this.side,
      angle: this.angle,
      flipping: !!this.flip,
      targetId: target?.id ?? null,
      targetLane: target?.lane ?? null,
      targetSide: target?.side ?? null,
      targetDistance: target ? target.contactDistance - this.distance : null,
      result: this.result,
      obstacles: this.obstacles.map((o) => ({ ...o })),
      history: this.history.map((o) => ({ ...o }))
    };
  }
};

// server/verify.js
function verifyRun(seed, payload) {
  const { ticks, inputs, score } = payload;
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > 36e3 || !Number.isInteger(score) || score < 0 || score > 500 || !Array.isArray(inputs) || inputs.length > 4e3) throw new Error("\u6210\u7EE9\u683C\u5F0F\u4E0D\u6B63\u786E");
  const game = new Game(seededRandom(seed));
  game.start();
  let previous = 0;
  for (const input of inputs) {
    if (!input || !Number.isInteger(input.t) || input.t < previous || input.t > ticks || ![-1, 0, 1].includes(input.a)) throw new Error("\u64CD\u4F5C\u8BB0\u5F55\u4E0D\u6B63\u786E");
    while (game.tickNumber < input.t && game.status !== "over") game.update(1 / 120);
    if (game.tickNumber !== input.t || !(input.a === 0 ? game.toggleFlip() : game.move(input.a))) throw new Error("\u64CD\u4F5C\u8BB0\u5F55\u65E0\u6CD5\u6838\u9A8C");
    previous = input.t;
  }
  while (game.tickNumber < ticks && game.status !== "over") game.update(1 / 120);
  if (game.tickNumber !== ticks || game.status !== "over" || game.score !== score) throw new Error("\u6210\u7EE9\u4E0E\u672C\u5C40\u64CD\u4F5C\u4E0D\u4E00\u81F4");
  return { score: game.score, ticks: game.tickNumber };
}

// server/edge.js
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var reply = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
var bad = (error, status = 400) => reply({ error }, status);
async function parseBody(request) {
  if (!request.headers.get("content-type")?.includes("application/json") || Number(request.headers.get("content-length")) > 1e5) throw new Error("\u63D0\u4EA4\u5185\u5BB9\u4E0D\u6B63\u786E");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("\u7F3A\u5C11\u63D0\u4EA4\u5185\u5BB9");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1e5) {
        await reader.cancel();
        throw new Error("\u63D0\u4EA4\u5185\u5BB9\u8FC7\u5927");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("\u63D0\u4EA4\u5185\u5BB9\u4E0D\u6B63\u786E");
  return data;
}
async function database(config, path, data) {
  const result = await fetch(`${config.url}/rest/v1/${path}`, { method: data ? "POST" : "GET", headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" }, body: data ? JSON.stringify(data) : void 0, signal: AbortSignal.timeout(12e3) });
  const json = await result.json();
  if (!result.ok) {
    const error = new Error(json.message || "Database unavailable");
    error.code = json.code;
    throw error;
  }
  return json;
}
var publicRow = (row) => ({ id: row.id, nickname: row.nickname, score: row.score, seconds: row.ticks / 120, createdAt: Number(row.finished_at) });
async function handleRequest(request, config) {
  const url = new URL(request.url), route = url.pathname.split("/").filter(Boolean).at(-1);
  try {
    if (!config.url || !config.key) throw new Error("Missing server configuration");
    if (request.method === "GET" && route === "leaderboard") {
      const mode = url.searchParams.get("mode") === "all" ? "all" : "best";
      const offset = Math.max(0, Math.min(1e6, Math.floor(Number(url.searchParams.get("offset")) || 0)));
      return reply(await database(config, "rpc/usb_game_leaderboard", { p_mode: mode, p_offset: offset }));
    }
    if (request.method !== "POST" || !["runs", "scores"].includes(route)) return bad("\u672A\u627E\u5230\u8FD9\u4E2A\u63A5\u53E3", 404);
    let data;
    try {
      data = await parseBody(request);
    } catch {
      return bad("\u63D0\u4EA4\u5185\u5BB9\u4E0D\u6B63\u786E");
    }
    if (route === "runs") {
      if (!UUID.test(data.playerId || "")) return bad("\u73A9\u5BB6\u6807\u8BC6\u4E0D\u6B63\u786E");
      try {
        return reply(await database(config, "rpc/usb_game_start_run", { p_player_id: data.playerId }), 201);
      } catch (error) {
        if (error.message.includes("rate_limit")) return bad("\u6311\u6218\u592A\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5", 429);
        throw error;
      }
    }
    if (!UUID.test(data.runId || "")) return bad("\u6311\u6218\u6807\u8BC6\u4E0D\u6B63\u786E");
    const nickname = typeof data.nickname === "string" ? data.nickname.normalize("NFC").trim() : "";
    if (!nickname || [...nickname].length > 16 || /[\p{Cc}\p{Cf}<>]/u.test(nickname)) return bad("\u6635\u79F0\u9700\u4E3A 1\u201316 \u4E2A\u5B57\uFF0C\u4E0D\u80FD\u5305\u542B\u7279\u6B8A\u63A7\u5236\u7B26");
    const rows = await database(config, `usb_game_runs?select=*&id=eq.${data.runId}&limit=1`), run = rows[0];
    if (!run) return bad("\u672C\u5C40\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u6311\u6218", 404);
    if (run.score !== null) return reply({ saved: true, record: publicRow(run) });
    let verified;
    try {
      verified = verifyRun(Number(run.seed), data);
    } catch (error) {
      return bad(error.message);
    }
    if (Date.now() - Number(run.created_at) + 1500 < verified.ticks / 120 * 1e3) return bad("\u6311\u6218\u65F6\u95F4\u4E0E\u8BB0\u5F55\u4E0D\u4E00\u81F4");
    const saved = await database(config, "rpc/usb_game_finish_run", { p_id: run.id, p_nickname: nickname, p_score: verified.score, p_ticks: verified.ticks });
    return reply({ saved: true, record: publicRow(saved) }, 201);
  } catch (error) {
    console.error(JSON.stringify({ event: "usb_game_api_error", route, message: error.message }));
    return bad("\u6392\u884C\u699C\u6682\u65F6\u8FDE\u63A5\u4E0D\u4E0A\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", 503);
  }
}

// supabase/functions/usb-game-api/source.ts
Deno.serve((request) => {
  const secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  return handleRequest(request, { url: Deno.env.get("SUPABASE_URL"), key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || secretKeys.default });
});
