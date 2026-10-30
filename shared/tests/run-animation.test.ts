import { describe, expect, it } from 'vitest';
import { animKind, clipAnimKind } from '../rules/anim';
import { STANDARD_SLOTS } from '../../client/src/m2m/slots';

describe('running from generated humanoid packs', () => {
  it('recognizes the existing default Jog clip without requiring saved slot mappings', () => {
    expect(STANDARD_SLOTS.run).toBe('Jog');
    for (const name of ['Jog', 'Jogging', 'jog_forward', 'Sprint', 'Run_Female']) expect(animKind(name)).toBe('run');
    expect(clipAnimKind('Jog', 'padrao-m2m-rig-123.glb')).toBe('run');
    expect(clipAnimKind('Walk', 'padrao-m2m-rig-123.glb')).toBe('walk');
  });
  it('classifies each clip before a multi-animation filename', () => {
    expect(clipAnimKind('Walk', 'running-library.glb')).toBe('walk');
    expect(clipAnimKind('Jog', 'walking-library.glb')).toBe('run');
    expect(clipAnimKind('Idle_A', 'run.glb')).toBe('idle');
  });
  it('preserves explicit single-clip hints and filename fallback', () => {
    expect(clipAnimKind('Action', 'correndo.glb')).toBe('run');
    expect(clipAnimKind('Action', 'model.glb', 'run')).toBe('run');
    expect(clipAnimKind('Jog', 'model.glb', 'special')).toBe('run');
    expect(clipAnimKind('Walk', 'model.glb', 'idle')).toBe('idle');
  });
});
