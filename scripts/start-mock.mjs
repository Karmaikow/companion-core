import { spawn } from 'node:child_process';
import path from 'node:path';
// Explicit opt-in, independent identity and data. Never touch the real Companion.
const child = spawn(process.execPath, ['dist/server/web-server.js'], {
  stdio: 'inherit', env: { ...process.env, MAYUNA_AI_PROVIDER: 'mock', MAYUNA_DATA_DIR: path.resolve('.mayuna-preview') }
});
child.on('exit', code => process.exit(code ?? 1));
