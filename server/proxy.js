const routes = new Set(['runs', 'scores', 'leaderboard']);
export async function proxy(request, response, route, config = process.env, fetcher = fetch) {
  const send = (status, value) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(typeof value === 'string' ? value : JSON.stringify(value)); };
  if (!routes.has(route)) return send(404, { error: '未找到这个接口' });
  if (request.method !== (route === 'leaderboard' ? 'GET' : 'POST')) return send(405, { error: '请求方式不正确' });
  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return send(503, { error: '排行榜服务暂未配置' });
  try {
    const origin = request.headers?.origin;
    if (origin && new URL(origin).host !== request.headers.host) return send(403, { error: '请求来源不正确' });
    const base = new URL(config.SUPABASE_URL);
    const incoming = new URL(request.url, 'http://localhost');
    const upstream = new URL(`/functions/v1/${config.SUPABASE_FUNCTION_NAME || 'usb-game-api'}/${route}`, base);
    if (route === 'leaderboard') { for (const key of ['mode', 'offset']) if (incoming.searchParams.has(key)) upstream.searchParams.set(key, incoming.searchParams.get(key)); }
    let payload;
    if (request.method === 'POST') {
      if (!request.headers?.['content-type']?.includes('application/json')) return send(400, { error: '提交内容不正确' });
      if (request.body !== undefined) payload = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      else { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > 100000) return send(413, { error: '提交内容过大' }); chunks.push(chunk); } payload = Buffer.concat(chunks).toString('utf8'); }
      if (Buffer.byteLength(payload || '') > 100000) return send(413, { error: '提交内容过大' });
    }
    const result = await fetcher(upstream, { method: request.method, headers: { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }, body: payload, signal: AbortSignal.timeout(20000) });
    const text = await result.text();
    if (!result.headers.get('content-type')?.includes('application/json')) return send(502, { error: '排行榜暂时连接不上，请稍后重试' });
    return send(result.status, text);
  } catch (error) {
    console.error(JSON.stringify({ event: 'usb_proxy_error', route, kind: error.name }));
    return send(503, { error: '排行榜暂时连接不上，请稍后重试' });
  }
}
