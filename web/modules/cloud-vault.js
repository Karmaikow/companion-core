import { cloudConfig } from './runtime-mode.js';

const SESSION_KEY = 'companion-core.supabase.session.v1';
const MAX_CRYSTAL_BYTES = 12_000_000;

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
  catch { return null; }
}
function writeSession(value) {
  if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else localStorage.removeItem(SESSION_KEY);
}
function configured() {
  return Boolean(cloudConfig?.url && cloudConfig?.publishableKey);
}
function messageOf(data, fallback) {
  return data?.msg || data?.message || data?.error_description || data?.error || fallback;
}
async function authRequest(path, body, token) {
  const headers = { apikey: cloudConfig.publishableKey, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${cloudConfig.url}/auth/v1/${path}`, {
    method: 'POST', headers, body: JSON.stringify(body), cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(messageOf(data, 'Não foi possível concluir a autenticação.'));
  return data;
}
async function refreshSession() {
  const current = readSession();
  if (!current?.refresh_token) { writeSession(null); return null; }
  try {
    const next = await authRequest('token?grant_type=refresh_token', { refresh_token: current.refresh_token });
    const session = { ...next, expires_at: Date.now() + Number(next.expires_in || 3600) * 1000 };
    writeSession(session);
    return session;
  } catch {
    writeSession(null);
    return null;
  }
}
async function validSession() {
  if (!configured()) throw new Error('Supabase ainda não está configurado neste deploy.');
  let session = readSession();
  if (!session?.access_token) return null;
  if (Number(session.expires_at || 0) < Date.now() + 30_000) session = await refreshSession();
  return session;
}
async function dataRequest(path, options = {}, retry = true) {
  const session = await validSession();
  if (!session) throw new Error('Sua sessão expirou. Entre novamente.');
  const response = await fetch(`${cloudConfig.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: cloudConfig.publishableKey,
      Authorization: `Bearer ${session.access_token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    cache: 'no-store'
  });
  if (response.status === 401 && retry) {
    const renewed = await refreshSession();
    if (renewed) return dataRequest(path, options, false);
  }
  const body = await response.text();
  if (!response.ok) {
    let data = {};
    try { data = JSON.parse(body); } catch {}
    throw new Error(messageOf(data, 'Não foi possível acessar o cofre.'));
  }
  return body ? JSON.parse(body) : null;
}

export const cloudAuth = {
  status: async () => {
    const session = await validSession();
    return { configured: true, authenticated: Boolean(session), user: session?.user || null };
  },
  signUp: async (email, password) => {
    const data = await authRequest('signup', { email: email.trim(), password });
    if (data.access_token) {
      const session = { ...data, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 };
      writeSession(session);
    }
    return { authenticated: Boolean(data.access_token), user: data.user || null };
  },
  signIn: async (email, password) => {
    const data = await authRequest('token?grant_type=password', { email: email.trim(), password });
    writeSession({ ...data, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 });
    return { authenticated: true, user: data.user || null };
  },
  signOut: async () => {
    const session = readSession();
    try {
      if (session?.access_token) {
        const headers = { apikey: cloudConfig.publishableKey, Authorization: `Bearer ${session.access_token}` };
        await fetch(`${cloudConfig.url}/auth/v1/logout`, { method: 'POST', headers, cache: 'no-store' });
      }
    } finally { writeSession(null); }
    return { authenticated: false };
  },
  currentUser: async () => (await validSession())?.user || null
};

export const cloudVault = {
  list: async () => dataRequest('companion_crystal_vault?select=companion_id,created_at,updated_at&order=updated_at.desc'),
  save: async (companionId, file) => {
    if (!/^MC-[A-Z0-9-]+$/i.test(companionId)) throw new Error('Informe o ID completo da Companion (MC-...).');
    if (new TextEncoder().encode(file).length > MAX_CRYSTAL_BYTES) throw new Error('O Cristal ultrapassa 12 MB.');
    let envelope;
    try { envelope = JSON.parse(file); } catch { throw new Error('O arquivo não é um Cristal de Memória válido.'); }
    if (envelope?.format !== 'companion-memory-crystal' || envelope?.version !== 1 ||
        typeof envelope.salt !== 'string' || typeof envelope.iv !== 'string' ||
        typeof envelope.tag !== 'string' || typeof envelope.ciphertext !== 'string') {
      throw new Error('O arquivo não tem um envelope criptografado compatível.');
    }
    await dataRequest('companion_crystal_vault?on_conflict=owner_id,companion_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        companion_id: companionId.toUpperCase(),
        crystal_document: envelope,
        updated_at: new Date().toISOString()
      })
    });
  },
  download: async companionId => {
    const rows = await dataRequest(`companion_crystal_vault?select=crystal_document&companion_id=eq.${encodeURIComponent(companionId)}&limit=1`);
    if (!rows?.length) throw new Error('Nenhum backup foi encontrado para este ID.');
    return JSON.stringify(rows[0].crystal_document);
  }
};
