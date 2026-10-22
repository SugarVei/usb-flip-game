import { build } from 'esbuild';
await build({ entryPoints: ['supabase/functions/usb-game-api/source.ts'], outfile: 'supabase/functions/usb-game-api/index.ts', bundle: true, minify: false, format: 'esm', target: 'es2022', platform: 'neutral' });
console.log('Built Supabase Edge Function from the shared game engine');
