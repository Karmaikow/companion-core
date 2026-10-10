import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';

const testFiles = (await readdir('tests'))
  .filter(file => file.endsWith('.test.mjs'))
  .sort()
  .map(file => `tests/${file}`);

// A user's configured transfer registry must not leak into isolated tests.
const env = { ...process.env };
delete env.COMPANION_REGISTRY_URL;

const child = spawn(process.execPath, ['--test', ...testFiles], {
  env,
  stdio: 'inherit'
});

child.on('error', error => {
  console.error(error);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
