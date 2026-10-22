const $ = s => document.querySelector(s);
const get = key => { try { return localStorage.getItem(key); } catch { return null; } };
const put = (key, value) => localStorage.setItem(key, value);
const validName = name => typeof name === 'string' && !!name && [...name].length <= 16 && !/[\p{Cc}\p{Cf}<>]/u.test(name);
const readArray = key => { try { const value = JSON.parse(get(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
export class Leaderboard {
  constructor() {
    this.offline = location.protocol === 'file:'; this.mode = 'best'; this.nextOffset = null; this.requestId = 0;
    this.playerId = get('usb-player-id') || crypto.randomUUID();
    const savedName = (get('usb-nickname') || '').normalize('NFC').trim(); this.nickname = validName(savedName) ? savedName : '';
    this.pending = readArray('usb-pending-scores').filter(row => row && typeof row.runId === 'string' && validName(row.nickname));
    try { put('usb-player-id', this.playerId); } catch {}
    $('#nickname').value = this.nickname;
    if (this.offline) $('#board-title').textContent = '本机排行榜';
    $('#retry-score-btn').addEventListener('click', () => this.flush());
    window.addEventListener('online', () => { this.flush(); this.load(); });
    for (const tab of document.querySelectorAll('[data-mode]')) tab.addEventListener('click', () => { this.mode = tab.dataset.mode; this.load(); });
    $('#refresh-board-btn').addEventListener('click', () => { this.load(); this.flush(); });
    $('#more-board-btn').addEventListener('click', () => this.load(false));
    $('.board-tabs').addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); const other = this.mode === 'best' ? $('#all-tab') : $('#best-tab'); other.click(); other.focus(); } });
    this.load(); this.flush();
  }
  setNickname(value) {
    const name = value.normalize('NFC').trim();
    if (!validName(name)) throw new Error('请输入 1–16 个字的昵称');
    this.nickname = name; try { put('usb-nickname', name); } catch {}
    return name;
  }
  async request(path, data) {
    const response = await fetch(path, { method: data ? 'POST' : 'GET', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(12000), cache: 'no-store' });
    const result = await response.json(); if (!response.ok) { const error = new Error(result.error || '连接失败，请重试'); error.status = response.status; throw error; } return result;
  }
  async newRun() {
    this.finished = null; this.savedId = null;
    this.run = this.offline ? { id: crypto.randomUUID(), seed: crypto.getRandomValues(new Uint32Array(1))[0] } : await this.request('/api/runs', { playerId: this.playerId });
    return this.run.seed;
  }
  persistPending() { try { put('usb-pending-scores', JSON.stringify(this.pending)); } catch {} }
  finish(game) {
    const payload = { runId: this.run.id, nickname: this.nickname, score: game.score, ticks: game.tickNumber, inputs: game.inputs.map(input => ({ ...input })) };
    this.finished = payload; $('#result-player-name').textContent = this.nickname; $('#submit-status').textContent = '正在自动保存成绩…'; $('#retry-score-btn').hidden = true;
    if (!this.pending.some(row => row.runId === payload.runId)) this.pending.push(payload);
    this.persistPending(); this.flush();
  }
  async save(payload) {
    if (!this.offline) return this.request('/api/scores', payload);
    const rows = readArray('usb-local-scores');
    const record = { id: payload.runId, playerId: this.playerId, nickname: payload.nickname, score: payload.score, seconds: payload.ticks / 120, createdAt: Date.now() };
    if (!rows.some(row => row.id === record.id)) rows.push(record);
    put('usb-local-scores', JSON.stringify(rows)); return { record };
  }
  async flush() {
    if (this.sending || !this.pending.length) return;
    clearTimeout(this.retryTimer); this.sending = true;
    if (this.finished) { $('#submit-status').textContent = '正在自动保存成绩…'; $('#retry-score-btn').hidden = true; }
    let changed = false, retry = false;
    try {
      while (this.pending.length) {
        const payload = this.pending[0];
        try {
          const result = await this.save(payload);
          this.retryDelay = 0;
          this.pending.shift(); this.persistPending(); changed = true;
          if (this.finished?.runId === payload.runId) { this.savedId = result.record.id; $('#submit-status').textContent = this.offline ? '成绩已自动保存到本机榜' : '成绩已自动计入全国排行榜'; $('#retry-score-btn').hidden = true; }
        } catch (error) {
          const permanent = error.status >= 400 && error.status < 500 && error.status !== 429;
          if (permanent) { this.pending.shift(); this.persistPending(); }
          if (this.finished?.runId === payload.runId) { $('#submit-status').textContent = permanent ? error.message : '暂未保存，联网后会自动重试'; $('#retry-score-btn').hidden = permanent; }
          if (!permanent) { if (this.finished) { $('#submit-status').textContent = '暂未保存，联网后会自动重试'; $('#retry-score-btn').hidden = false; } retry = true; break; }
        }
      }
    } finally { this.sending = false; if (changed) this.load(); if (retry && this.pending.length) { this.retryDelay = Math.min(this.retryDelay ? this.retryDelay * 2 : 3000, 30000); this.retryTimer = setTimeout(() => this.flush(), this.retryDelay); } }
  }
  localRows(offset) {
    let rows = readArray('usb-local-scores').sort((a,b) => b.score - a.score || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    if (this.mode === 'best') { const seen = new Set(); rows = rows.filter(row => { if (seen.has(row.playerId)) return false; seen.add(row.playerId); return true; }); }
    return { total: rows.length, rows: rows.slice(offset, offset + 20).map((row, index) => ({ ...row, rank: offset + index + 1 })), nextOffset: offset + 20 < rows.length ? offset + 20 : null };
  }
  async load(reset = true) {
    if (!reset && this.nextOffset === null) return;
    const id = ++this.requestId, offset = reset ? 0 : this.nextOffset;
    if (reset) $('#board-rows').replaceChildren();
    $('#board-panel').setAttribute('aria-busy', 'true'); $('#board-status').textContent = '正在读取…'; $('#more-board-btn').hidden = true;
    for (const tab of document.querySelectorAll('[data-mode]')) { const selected = tab.dataset.mode === this.mode; tab.setAttribute('aria-selected', selected); tab.tabIndex = selected ? 0 : -1; }
    $('#board-panel').setAttribute('aria-labelledby', this.mode === 'best' ? 'best-tab' : 'all-tab');
    try {
      const result = this.offline ? this.localRows(offset) : await this.request(`/api/leaderboard?mode=${this.mode}&offset=${offset}`);
      if (id !== this.requestId) return;
      this.nextOffset = result.nextOffset;
      $('#board-count').textContent = `${this.offline ? '本机 · ' : ''}${result.total} ${this.mode === 'best' ? '位玩家' : '次挑战'}`;
      for (const row of result.rows) {
        const tr = document.createElement('tr'); if (row.id === this.savedId) tr.classList.add('my-score');
        const rank = document.createElement('td'); rank.textContent = String(row.rank).padStart(2, '0'); if (row.rank <= 3) rank.className = 'podium';
        const player = document.createElement('td'), name = document.createElement('span'), date = document.createElement('time');
        name.textContent = row.nickname; date.dateTime = new Date(row.createdAt).toISOString(); date.textContent = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(row.createdAt));
        player.append(name, date); const score = document.createElement('td'); score.textContent = row.score; tr.append(rank, player, score); $('#board-rows').append(tr);
      }
      $('#board-status').textContent = result.total === 0 ? '还没有成绩，来做第一个挑战者' : '';
      $('#more-board-btn').hidden = result.nextOffset === null;
    } catch { if (id === this.requestId) { $('#board-status').textContent = '读取失败，请点刷新重试'; $('#more-board-btn').hidden = reset || this.nextOffset === null; } }
    finally { if (id === this.requestId) $('#board-panel').setAttribute('aria-busy', 'false'); }
  }
}
