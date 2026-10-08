import { request } from './http.js';
import { connectWithCode } from './remote-transport.js';
export const api = {
  async pairingStatus() { return (await request('/api/remote/pairing/status', { cache: 'no-store' })).json(); },
  async createPairingCode() {
    const response = await request('/api/remote/pairing/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível gerar o código.'); return data;
  },
  async connect(code) { return connectWithCode(code); },
  async state() {
    const response = await request('/api/companion/state', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (response.status === 401) window.dispatchEvent(new Event('mayuna:unauthorized'));
    if (!response.ok) throw new Error('Não foi possível carregar o Core.');
    return response.json();
  },
  async chat(message) {
    const response = await request('/api/companion/chat', {
      method: 'POST',
      signal: AbortSignal.timeout(155_000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await response.json();
    if (response.status === 401) window.dispatchEvent(new Event('mayuna:unauthorized'));
    if (!response.ok) throw new Error(data.detail || data.error || 'Falha na conversa.');
    return data;
  },
  async verify() {
    const response = await request('/api/companion/verify', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const data = await response.json();
    if (response.status === 401) window.dispatchEvent(new Event('mayuna:unauthorized'));
    if (!response.ok && !data.reason) throw new Error('Falha na verificação.');
    return data;
  }
};
