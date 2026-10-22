import { verifyRun } from './verify.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const bad = (error, status = 400) => reply({ error }, status);
async function parseBody(request) {
  if (!request.headers.get('content-type')?.includes('application/json') || Number(request.headers.get('content-length')) > 100000) throw new Error('提交内容不正确');
  const reader = request.body?.getReader(); if (!reader) throw new Error('缺少提交内容');
  let size = 0; const chunks = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 100000) { await reader.cancel(); throw new Error('提交内容过大'); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const data = JSON.parse(new TextDecoder().decode(bytes)); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('提交内容不正确'); return data;
}
async function database(config, path, data) {
  const result = await fetch(`${config.url}/rest/v1/${path}`, { method: data ? 'POST' : 'GET', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(12000) });
  const json = await result.json();
  if (!result.ok) { const error = new Error(json.message || 'Database unavailable'); error.code = json.code; throw error; } return json;
}
const publicRow = row => ({ id: row.id, nickname: row.nickname, score: row.score, seconds: row.ticks / 120, createdAt: Number(row.finished_at) });
export async function handleRequest(request, config) {
  const url = new URL(request.url), route = url.pathname.split('/').filter(Boolean).at(-1);
  try {
    if (!config.url || !config.key) throw new Error('Missing server configuration');
    if (request.method === 'GET' && route === 'leaderboard') {
      const mode = url.searchParams.get('mode') === 'all' ? 'all' : 'best';
      const offset = Math.max(0, Math.min(1000000, Math.floor(Number(url.searchParams.get('offset')) || 0)));
      return reply(await database(config, 'rpc/usb_game_leaderboard', { p_mode: mode, p_offset: offset }));
    }
    if (request.method !== 'POST' || !['runs', 'scores'].includes(route)) return bad('未找到这个接口', 404);
    let data; try { data = await parseBody(request); } catch { return bad('提交内容不正确'); }
    if (route === 'runs') {
      if (!UUID.test(data.playerId || '')) return bad('玩家标识不正确');
      try { return reply(await database(config, 'rpc/usb_game_start_run', { p_player_id: data.playerId }), 201); }
      catch (error) { if (error.message.includes('rate_limit')) return bad('挑战太频繁，请稍后再试', 429); throw error; }
    }
    if (!UUID.test(data.runId || '')) return bad('挑战标识不正确');
    const nickname = typeof data.nickname === 'string' ? data.nickname.normalize('NFC').trim() : '';
    if (!nickname || [...nickname].length > 16 || /[\p{Cc}\p{Cf}<>]/u.test(nickname)) return bad('昵称需为 1–16 个字，不能包含特殊控制符');
    const rows = await database(config, `usb_game_runs?select=*&id=eq.${data.runId}&limit=1`), run = rows[0];
    if (!run) return bad('本局已过期，请重新挑战', 404);
    if (run.score !== null) return reply({ saved: true, record: publicRow(run) });
    let verified; try { verified = verifyRun(Number(run.seed), data); } catch (error) { return bad(error.message); }
    if (Date.now() - Number(run.created_at) + 1500 < verified.ticks / 120 * 1000) return bad('挑战时间与记录不一致');
    const saved = await database(config, 'rpc/usb_game_finish_run', { p_id: run.id, p_nickname: nickname, p_score: verified.score, p_ticks: verified.ticks });
    return reply({ saved: true, record: publicRow(saved) }, 201);
  } catch (error) {
    console.error(JSON.stringify({ event: 'usb_game_api_error', route, message: error.message }));
    return bad('排行榜暂时连接不上，请稍后重试', 503);
  }
}
