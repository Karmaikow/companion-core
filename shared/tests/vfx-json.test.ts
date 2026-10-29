import { describe, it, expect } from 'vitest';
import { parseVfxJson, exampleVfxJson, VFX_JSON_LIMIT } from '../../client/src/ui/vfxJson';
describe('importação VFX JSON', () => {
  const recipe = () => JSON.parse(exampleVfxJson());
  it('accepts recipes and Markdown from chat without changing layers', () => {
    const r=recipe(); expect(parseVfxJson(JSON.stringify(r))).toEqual(r.layers);
    expect(parseVfxJson('```json\n'+JSON.stringify(r)+'\n```')).toEqual(r.layers);
  });
  it('rejects malformed, empty, unsupported and oversized recipes', () => {
    for (const s of ['no', 'null','[]','{}','{"layers":[]}', ' '.repeat(VFX_JSON_LIMIT+1)]) expect(()=>parseVfxJson(s)).toThrow();
    for (const kind of ['unknown','constructor','__proto__']) {const r=recipe();r.layers[0].kind=kind as never;expect(()=>parseVfxJson(JSON.stringify(r))).toThrow();}
    expect(()=>parseVfxJson(JSON.stringify({layers:Array(7).fill(recipe().layers[0])}))).toThrow();
  });
  it('rejects invalid values instead of silently clamping or dropping layers', () => {
    for (const patch of [{count:7},{count:1.5},{duration:4},{size:null},{phase:'oops'},{anchor:'oops'},{color:'red'},{enabled:'true'},{delay:-1}]) {
      const r=recipe();Object.assign(r.layers[0],patch);expect(()=>parseVfxJson(JSON.stringify(r))).toThrow(/Camada 1/);
    }
  });
  it('extracts only visual fields and keeps input immutable', () => {
    const r=recipe();const before=JSON.stringify(r);const result=parseVfxJson(JSON.stringify({...r,power:999}));
    expect(result).toEqual(r.layers);result[0].color='#ffffff';expect(JSON.stringify(r)).toBe(before);
  });
});
