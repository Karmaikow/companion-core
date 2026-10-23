/**
 * Constelação Viva offline: as MESMAS regras do servidor, simuladas neste aparelho (por Companion).
 * Repetir o mesmo pedido devolve o mesmo resultado; a versão impede escrever por cima de uma mudança mais nova.
 */
import {
  DEFAULT_BALANCE, MAX_PROFILES, PROFILE_NAME, applyBlockers, budget, checkAllocation, demoProfiles, migrateBuild, parseAllocation, parseResonance, progressionStage,
  type BuildProfile, type BuildState, type SpeciesKey,
} from '@rules';
import { useGame } from '../store';
import type { BuildReply, BuildView } from './types';

const key = (id: string) => 'companion-core:build-local:v1:' + id;
interface Save extends BuildState { done: Record<string, BuildReply> }
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));

function me() {
  const c = useGame.getState().snap?.companion;
  return { id: c?.id ?? 'local', species: (c?.discoveries.form ?? null) as SpeciesKey | null, stage: progressionStage(c?.bond.level ?? 1) };
}
function load(): Save {
  const m = me();
  try { const raw = JSON.parse(localStorage.getItem(key(m.id)) ?? 'null'); if (raw?.active) return { done: {}, ...raw }; } catch { /* começa de novo */ }
  return { ...migrateBuild(m.species, m.stage), done: {} };
}
function save(s: Save) { try { s.done = Object.fromEntries(Object.entries(s.done).slice(-40)); localStorage.setItem(key(me().id), JSON.stringify(s)); } catch { /* só na memória */ } }

function view(s: Save, flags: Record<string, unknown> = {}): BuildView {
  const m = me();
  const { done: _d, ...st } = s;
  return { ...st, stage: m.stage, budget: budget(m.stage), blockers: applyBlockers({ inCombat: flags.inCombat === true, gathering: flags.gathering === true, crafting: flags.crafting === true }), config: DEFAULT_BALANCE, simulated: true };
}

export async function localBuild(action: string, body: Record<string, unknown> = {}): Promise<BuildReply> {
  const s = load(), m = me();
  if (action === 'build.state') return { build: view(s, body) };
  const req = typeof body.request === 'string' ? body.request : '';
  if (!req) throw new Error('Pedido sem identificador.');
  if (s.done[req]) return { ...s.done[req], build: view(s, body), repeat: true };
  if (Number.isInteger(body.version) && body.version !== s.version) throw new Error('A build mudou em outro lugar. Recarreguei a versão atual.');
  const commit = (r: BuildReply) => { s.version += 1; s.done[req] = { ...r, build: undefined }; save(s); return { ...r, build: view(s, body) }; };
  const prof = (p: unknown, keep?: string): BuildProfile => {
    const o = (p ?? {}) as Record<string, unknown>, name = String(o.name ?? '').trim().slice(0, 24);
    if (!PROFILE_NAME.test(name)) throw new Error('Nome do perfil inválido (até 24 letras, números e espaços).');
    const alloc = parseAllocation(o.alloc), chk = checkAllocation(alloc, m.stage);
    if (!chk.ok) throw new Error(chk.reason);
    const resonance = parseResonance(o.resonance);
    if (resonance === undefined) throw new Error('Ressonância indisponível.');
    return { id: keep ?? uuid(), name, alloc: alloc!, resonance };
  };

  if (action === 'build.apply') {
    const alloc = parseAllocation(body.alloc), chk = checkAllocation(alloc, m.stage);
    if (!chk.ok) throw new Error(chk.reason);
    const resonance = parseResonance(body.resonance);
    if (resonance === undefined) throw new Error('Ressonância indisponível.');
    const why = view(s, body).blockers;
    if (why.length) { s.pending = { alloc: alloc!, resonance, at: new Date().toISOString(), reason: why[0] }; return commit({ applied: false, pending: true, reason: why[0] }); }
    s.active = { alloc: alloc!, resonance }; s.pending = null;
    return commit({ applied: true });
  }
  if (action === 'build.cancelPending') { s.pending = null; return commit({ cancelled: true }); }
  if (action === 'build.profile.save') {
    const id = (body.profile as Record<string, unknown> | undefined)?.id;
    const exists = typeof id === 'string' ? s.profiles.find((p) => p.id === id) : undefined;
    const p = prof(body.profile, exists?.id);
    const next = exists ? s.profiles.map((x) => (x.id === p.id ? p : x)) : [...s.profiles, p];
    if (next.length > MAX_PROFILES) throw new Error(`No máximo ${MAX_PROFILES} perfis.`);
    s.profiles = next; return commit({ saved: p.id });
  }
  if (action === 'build.profile.duplicate') {
    const src = s.profiles.find((p) => p.id === body.id);
    if (!src) throw new Error('Perfil não encontrado.');
    if (s.profiles.length >= MAX_PROFILES) throw new Error(`No máximo ${MAX_PROFILES} perfis.`);
    const copy = { ...src, id: uuid(), name: (src.name + ' (cópia)').slice(0, 24) };
    s.profiles = [...s.profiles, copy]; return commit({ saved: copy.id });
  }
  if (action === 'build.profile.delete') { s.profiles = s.profiles.filter((p) => p.id !== body.id); return commit({}); }
  if (action === 'build.demo') {
    const demo = demoProfiles(m.stage).filter((d) => !s.profiles.some((p) => p.name === d.name)).map((d) => ({ ...d, id: uuid() }));
    s.profiles = [...s.profiles, ...demo].slice(0, MAX_PROFILES); return commit({});
  }
  throw new Error('Ação desconhecida.');
}
