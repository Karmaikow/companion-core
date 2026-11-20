import { describe, expect, it, beforeEach } from 'vitest';
import { NODE_KINDS, type ResourceNode } from '@rules';
import { useEcos, toolBelt } from './ecosStore';
import type { EcosView } from './types';
import { pickApproach } from './quickGather';

const erva: ResourceNode = { id: 'teste-erva', kind: 'erva', x: 0, z: 0 };
const now = 1_800_000_000_000;

function view(over: { tools?: string[]; amount?: number; bagUsed?: number } = {}): EcosView {
  return {
    serverNow: now,
    profile: { tools: over.tools ?? ['faca'], seen: [], knownMaterials: [], techniques: [], chain: {} },
    bag: over.bagUsed ? [{ key: 'folha-orvalho', qty: over.bagUsed }] : [],
    nodes: over.amount !== undefined ? { [erva.id]: { amount: over.amount, at: now } } : {},
    sites: [], project: { id: '', stage: 0, progress: [], startedAt: 0, completedAt: null, goals: [], mine: 0, mineTotal: 0, capTotal: 0 },
    config: { bag: 60 },
  } as unknown as EcosView;
}

describe('pickApproach (coleta com um clique)', () => {
  beforeEach(() => { toolBelt.get = () => undefined; });

  it('com tudo em ordem, escolhe a abordagem mais leve (a primeira)', () => {
    useEcos.setState({ view: view() });
    const r = pickApproach(erva, now);
    expect('approach' in r && r.approach.id).toBe(NODE_KINDS.erva.approaches[0].id);
  });

  it('sem a ferramenta, avisa qual falta', () => {
    useEcos.setState({ view: view({ tools: [] }) });
    const r = pickApproach(erva, now);
    expect('blocked' in r && r.blocked).toMatch(/^Precisa de /);
  });

  it('ferramenta guardada: pede para equipar', () => {
    useEcos.setState({ view: view() });
    toolBelt.get = () => false;
    const r = pickApproach(erva, now);
    expect('blocked' in r && r.blocked).toMatch(/equipe no Inventário/);
  });

  it('mochila cheia: avisa', () => {
    useEcos.setState({ view: view({ bagUsed: 60 }) });
    const r = pickApproach(erva, now);
    expect('blocked' in r && r.blocked).toMatch(/Mochila cheia/);
  });
});
