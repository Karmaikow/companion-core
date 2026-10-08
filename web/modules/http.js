import { mode } from './runtime-mode.js';
export async function request(url, options) {
  if (mode === 'demo') return (await import('./demo-transport.js')).demoRequest(url, options);
  if (mode === 'connect') return (await import('./remote-transport.js')).remoteRequest(url, options);
  return fetch(url, options);
}
