// Keep the entry point synchronous: failures must be recorded before loading the Core.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const log = path.join(root, 'core-startup.log');
const stageFile = path.join(root, 'core-startup-stage.txt');
function stage(message) {
  fs.writeFileSync(stageFile, message);
  fs.appendFileSync(log, `[bootstrap] ${message}\n`);
}
function failure(error) {
  // Never print environment, credentials, request bodies or Companion state.
  const name = String(error?.name || 'Error').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 80);
  const code = String(error?.code || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 80);
  const frames = String(error?.stack || '').split('\n').filter(line => /^\s+at /.test(line)).slice(0, 12).join('\n');
  try { stage(`Falha: ${name}${code ? ' (' + code + ')' : ''}`); fs.appendFileSync(log, frames + '\n'); } catch (_) {}
  process.exit(1);
}
process.on('uncaughtException', failure);
process.on('unhandledRejection', failure);
try {
  stage(`JavaScript iniciado · Node ${process.version} · ${process.platform}/${process.arch}`);
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '4187';
  process.env.MAYUNA_DATA_DIR = path.join(root, 'companion-data');
  process.env.COMPANION_REGISTRY_URL = 'https://rqdukyenuecrshzmofdo.supabase.co/functions/v1/companion-registry';
  process.env.MAYUNA_AI_PROVIDER = 'android';
  process.env.COMPANION_ANDROID_SETTINGS = path.join(root, 'gateway.json');
  process.chdir(__dirname);
  stage('Carregando servidor interno');
  require('./server.cjs');
} catch (error) { failure(error); }
