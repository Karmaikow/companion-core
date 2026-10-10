import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Preserve the existing mobile data directory; do not import PC identities automatically.
const root = fileURLToPath(new URL('../', import.meta.url));
const entry = path.join(root, 'dist/server/web-server.js');
if (Number(process.versions.node.split('.')[0]) < 20) {
  console.error('Use Node.js 20 ou posterior no Termux.'); process.exit(1);
}
if (process.platform === 'android' && /^\/(sdcard|storage|mnt\/media_rw)(\/|$)/.test(root)) {
  console.error('Extraia o pacote na pasta privada do Termux, não no armazenamento compartilhado. Veja ANDROID.md.'); process.exit(1);
}
try { await access(entry); } catch {
  console.error('Build não encontrado. Use o pacote Android pré-compilado ou execute npm run build.'); process.exit(1);
}
const provider = process.env.MAYUNA_AI_PROVIDER ?? 'mock';
console.log('COMPANION CORE · TESTE ANDROID');
console.log(`Core e persistência locais. Provider: ${provider}. Identidade independente da Mayuna do PC.`);
console.log(`Dados locais: ${path.resolve(process.env.MAYUNA_DATA_DIR ?? path.join(root, '.mayuna-mobile-preview'))} (preservados entre reinícios).`);
if(provider==='mock')console.log('Modo simulado: não é conversa com um modelo de IA. Para IA real, configure Ollama acessível.');
console.log('Abra http://127.0.0.1:4173 no navegador deste aparelho.');
const child = spawn(process.execPath, [entry], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    HOST: '127.0.0.1', PORT: '4173',
    MAYUNA_AI_PROVIDER: provider,
    MAYUNA_DATA_DIR: path.resolve(process.env.MAYUNA_DATA_DIR ?? path.join(root, '.mayuna-mobile-preview')),
    MAYUNA_RUNTIME_ENVIRONMENT: 'android-preview',
    ...(process.env.MAYUNA_REMOTE_ORIGIN ? {MAYUNA_REMOTE_ORIGIN: process.env.MAYUNA_REMOTE_ORIGIN} : {})
  }
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error('Não foi possível iniciar o Core:', error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 0 : 1); });
