export const LANES = [-2.05, 0, 2.05];
export const TAU = Math.PI * 2;
export const COMPUTER_GAP = 14.4;
export const BASE_SPEED = 5.52;
export const DROP_DISTANCE = 21;
export const DROP_DURATION = .78;
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const smooth = t => (t = clamp(t, 0, 1), t * t * (3 - 2 * t));
export const orientationError = (angle, side) => Math.abs(Math.atan2(Math.sin(angle - side * Math.PI), Math.cos(angle - side * Math.PI)));
export function spring(x, v, target, dt, omega = 21) {
  const offset = x - target, c = v + omega * offset, e = Math.exp(-omega * dt);
  return [target + (offset + c * dt) * e, (v - omega * c * dt) * e];
}
export function speedForClears(clears) {
  return 1.05 ** clears;
}
export function seededRandom(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
export class Game {
  constructor(random = Math.random) { this.random = random; this.status = 'ready'; this.events = []; }
  start() {
    this.status = 'running'; this.paused = false; this.score = 0; this.cleared = 0;
    this.distance = 0; this.totalTime = 0; this.phaseTime = 0;
    this.tickNumber = 0; this.accumulator = 0; this.inputs = [];
    this.speed = 1; this.velocity = BASE_SPEED; this.lane = 1; this.x = 0; this.vx = 0;
    this.angle = 0; this.side = 0; this.flip = null; this.dockingUntil = 0;
    this.obstacles = []; this.history = []; this.nextId = 1; this.nextContact = COMPUTER_GAP;
    this.previousLane = -1; this.result = null; this.events = [];
    this.fillQueue(); this.updateDrops(0); this.emit('start');
  }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drainEvents() { return this.events.splice(0); }
  fillQueue() {
    while (this.nextContact - this.distance <= COMPUTER_GAP * 3 + .01) {
      const lane = this.previousLane < 0 ? Math.floor(this.random() * 3) : (this.previousLane + 1 + Math.floor(this.random() * 2)) % 3;
      const obstacle = { id: this.nextId++, contactDistance: this.nextContact, lane, side: this.random() < .5 ? 0 : 1, state: 'waiting', dropAge: 0, dropDuration: Math.min(DROP_DURATION, COMPUTER_GAP / (BASE_SPEED * speedForClears(this.cleared)) * .7), landedAt: null, resolvedAt: null };
      this.previousLane = lane; this.obstacles.push(obstacle); this.nextContact += COMPUTER_GAP;
      this.emit('spawn', { id: obstacle.id });
    }
  }
  get target() { return this.obstacles?.find(o => o.state === 'waiting' || o.state === 'falling' || o.state === 'landed'); }
  canControl() { return this.status === 'running' && !this.paused && this.totalTime >= this.dockingUntil; }
  move(direction) {
    if (!this.canControl()) return false;
    const lane = clamp(this.lane + direction, 0, 2);
    if (lane === this.lane) return false;
    this.inputs.push({ t: this.tickNumber, a: Math.sign(direction) });
    this.lane = lane; this.emit('move'); return true;
  }
  toggleFlip() {
    if (!this.canControl() || this.flip) return false;
    this.side = 1 - this.side;
    this.inputs.push({ t: this.tickNumber, a: 0 });
    this.flip = { start: this.angle, end: this.angle + Math.PI, t: 0 };
    this.emit('flip'); return true;
  }
  togglePause(force) {
    if (!['running', 'crash'].includes(this.status)) return;
    this.paused = force ?? !this.paused; this.emit('pause', { paused: this.paused });
  }
  update(dt) {
    if (this.paused || !['running', 'crash'].includes(this.status) || !Number.isFinite(dt) || dt <= 0) return;
    this.accumulator += Math.min(dt, .25);
    while (this.accumulator + 1e-10 >= 1 / 120) {
      this.accumulator -= 1 / 120; this.tickNumber++; this.tick(1 / 120);
      if (this.status === 'over') break;
    }
  }
  updateDrops(dt) {
    for (const o of this.obstacles) {
      if (o.state === 'waiting' && o.contactDistance - this.distance <= DROP_DISTANCE) {
        o.state = 'falling'; o.dropAge = 0; this.emit('drop', { id: o.id });
      }
      if (o.state === 'falling') {
        o.dropAge = Math.min(o.dropAge + dt, o.dropDuration);
        if (o.dropAge >= o.dropDuration) { o.state = 'landed'; o.landedAt = this.totalTime; this.emit('land', { id: o.id }); }
      }
    }
  }
  tick(dt) {
    this.totalTime += dt;
    if (this.status === 'crash') {
      this.phaseTime += dt;
      if (this.phaseTime >= .68) { this.status = 'over'; this.emit('over', this.result); }
      return;
    }
    [this.x, this.vx] = spring(this.x, this.vx, LANES[this.lane], dt);
    if (this.flip) {
      this.flip.t += dt;
      this.angle = this.flip.start + (this.flip.end - this.flip.start) * smooth(this.flip.t / .34);
      if (this.flip.t >= .34) { this.angle = this.flip.end % TAU; this.flip = null; }
    }
    // Smoothly reach the next speed. Distance and player orientation are never reset between computers.
    this.speed = speedForClears(this.cleared);
    this.velocity += (BASE_SPEED * this.speed - this.velocity) * (1 - Math.exp(-dt * 2.5));
    this.distance += this.velocity * dt;
    this.updateDrops(dt);
    const target = this.target;
    if (target && this.distance >= target.contactDistance) this.resolve(target);
    if (this.status === 'running') {
      this.obstacles = this.obstacles.filter(o => this.distance - o.contactDistance < 13);
      this.fillQueue();
    }
  }
  resolve(obstacle) {
    const positionOK = Math.abs(this.x - LANES[obstacle.lane]) <= .31;
    const sideOK = orientationError(this.angle, obstacle.side) < .12;
    const landed = obstacle.state === 'landed';
    const success = positionOK && sideOK && landed;
    const reason = !positionOK ? 'position' : !sideOK ? 'orientation' : !landed ? 'landing' : 'success';
    obstacle.state = success ? 'breaking' : 'crashed'; obstacle.resolvedAt = this.totalTime;
    this.result = { id: obstacle.id, success, reason, positionOK, sideOK, distance: this.distance };
    this.history.push({ ...this.result }); if (this.history.length > 50) this.history.shift();
    if (success) {
      this.cleared++; this.score = this.cleared; this.speed = speedForClears(this.cleared); this.dockingUntil = this.totalTime + .14;
      this.emit('success', this.result);
    } else {
      this.status = 'crash'; this.phaseTime = 0; this.flip = null;
      this.emit('fail', this.result);
    }
  }
  snapshot() {
    const target = this.target;
    return { status: this.status, paused: this.paused, score: this.score, cleared: this.cleared,
      distance: this.distance, totalTime: this.totalTime, tickNumber: this.tickNumber, speed: this.speed, velocity: this.velocity,
      lane: this.lane, x: this.x, side: this.side, angle: this.angle, flipping: !!this.flip,
      targetId: target?.id ?? null, targetLane: target?.lane ?? null, targetSide: target?.side ?? null,
      targetDistance: target ? target.contactDistance - this.distance : null, result: this.result,
      obstacles: this.obstacles.map(o => ({ ...o })), history: this.history.map(o => ({ ...o })) };
  }
}
