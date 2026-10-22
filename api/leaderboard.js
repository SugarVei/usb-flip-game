import { proxy } from '../server/proxy.js';
export default (request, response) => proxy(request, response, 'leaderboard');
