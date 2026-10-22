import { handleRequest } from '../../../server/edge.js';
Deno.serve(request => {
  const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  return handleRequest(request, { url: Deno.env.get('SUPABASE_URL'), key: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || secretKeys.default });
});
