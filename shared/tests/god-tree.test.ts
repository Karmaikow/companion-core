import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ upsert: vi.fn(), storage: vi.fn(), backend: { kind: 'online' } }));
vi.mock('../../client/src/backend/online', () => ({ supabase: () => ({ from: () => ({ upsert: mocks.upsert }) }) }));
vi.mock('../../client/src/store', () => ({ useGame: { getState: () => ({ backend: mocks.backend }) } }));
vi.mock('../../client/src/build/combatStats', () => ({ castSkill: vi.fn() }));
import { useGod } from '../../client/src/ui/godMode';
import { persistAlloc, saveBar, useSkills } from '../../client/src/ui/skillState';

describe('God tree sandbox', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: mocks.storage });
    vi.clearAllMocks();
    useGod.getState().setAdmin(false);
    useSkills.setState({ alloc: { original: 2 }, bar: ['original'], removed: [] });
  });
  it('requires admin and keeps trial allocation separate from saved allocation and persistence', async () => {
    useGod.getState().testTree('companion-a', 'touro', 'fogo');
    expect(useGod.getState().treeProfile).toBeNull();
    useGod.getState().setAdmin(true);
    useGod.getState().testTree('companion-a', 'touro', 'fogo');
    await persistAlloc('companion-a', { trial: 3 });
    saveBar('companion-a', ['trial'], []);
    expect(useGod.getState().treeProfile?.alloc).toEqual({ trial: 3 });
    expect(useSkills.getState().alloc).toEqual({ original: 2 });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it('resets points on changing the test combination and clears testing on loss of admin', () => {
    useGod.getState().setAdmin(true);
    useGod.getState().testTree('companion-a', 'touro', 'fogo');
    useGod.getState().setTestAlloc({ trial: 3 });
    useGod.getState().testTree('companion-a', 'mistica', 'agua');
    expect(useGod.getState().treeProfile).toMatchObject({ species: 'mistica', essence: 'agua', alloc: {} });
    useGod.getState().setAdmin(false);
    expect(useGod.getState().treeProfile).toBeNull();
  });
  it('continues persisting other Companions and persists normally after ending a trial', async () => {
    useGod.getState().setAdmin(true);
    useGod.getState().testTree('companion-a', 'touro', null);
    await persistAlloc('companion-b', { actual: 1 });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ companion_id: 'companion-b' }));
    useGod.getState().stopTreeTest();
    await persistAlloc('companion-a', { real: 2 });
    saveBar('companion-a', ['real'], []);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ companion_id: 'companion-a', alloc: { real: 2 } }));
    expect(mocks.storage).toHaveBeenCalled();
  });
});
