// Runs inside the APK process. No shell or Termux is involved.
import path from 'node:path';
process.env.HOST='127.0.0.1';
process.env.PORT='4187';
process.env.MAYUNA_DATA_DIR=path.resolve('../companion-data');
process.env.COMPANION_REGISTRY_URL='https://rqdukyenuecrshzmofdo.supabase.co/functions/v1/companion-registry';
process.env.MAYUNA_AI_PROVIDER='android';
process.env.COMPANION_ANDROID_SETTINGS=path.resolve('../gateway.json');
// Embedded Node supports ESM; all Core dependencies are built-in modules.
await import('./dist/server/web-server.js');
