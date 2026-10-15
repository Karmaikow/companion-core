import { request } from './http.js';
import { connectWithCode } from './remote-transport.js';
export const api = {
  async pairingStatus() { return (await request('/api/remote/pairing/status', { cache: 'no-store' })).json(); },
  async createPairingCode() {
    const response = await request('/api/remote/pairing/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível gerar o código.'); return data;
  },
  async connect(code) { return connectWithCode(code); },
  async companions() {
    const response = await request('/api/companions', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o Hub.'); return data;
  },
  async createCompanion(profile) {
    const response = await request('/api/companions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000), body: JSON.stringify(profile) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível criar a Companion.'); return data;
  },
  async activateCompanion(id) {
    const response = await request(`/api/companions/${encodeURIComponent(id)}/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível trocar de Companion.'); return data;
  },
  async state() {
    const response = await request('/api/companion/state', { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (response.status === 401) window.dispatchEvent(new Event('mayuna:unauthorized'));
    if (!response.ok) throw new Error('Não foi possível carregar o Core.');
    return response.json();
  },
  async claimQuest(id,questId) {
    const response=await request('/api/companion/quests/claim',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({id,questId})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível receber a recompensa.');return data;
  },
  async affection(id) {
    const response=await request('/api/companion/interaction',{method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Não foi possível registrar o carinho.');return data;
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
