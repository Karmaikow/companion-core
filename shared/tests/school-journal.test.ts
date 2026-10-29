import { describe, it, expect, vi } from 'vitest';
import { classifySchoolEvent, schoolJournal, type SchoolSourceEvent } from '../rules/combat/schoolJournal';
import { readSchoolEvents, schoolView } from '../../supabase/functions/refuge/schools';
const event = (id: number, kind = 'ecos.clue', payload: Record<string, unknown> = {chain:'seiva-azul',step:'seiva'}): SchoolSourceEvent => ({id,kind,payload,actor:'system',created_at:'2026-10-29T10:00:00Z'});
describe('persistent school journal', () => {
  it('classifies factual exploration and preserves provenance', () => {
    const memory = classifySchoolEvent('mayuna',event(1));
    expect(memory).toMatchObject({companionId:'mayuna',eventId:'1',themes:['magia','descoberta'],source:'discovery'});
  });
  it('does not turn chat, AI classification, or invalid events into achievements', () => {
    expect(classifySchoolEvent('mayuna',event(1,'chat.companion',{themes:['runas'],relevance:'extraordinary'}))).toBeNull();
    expect(classifySchoolEvent('mayuna',{...event(1),actor:'player'})).toBeNull();
    expect(classifySchoolEvent('mayuna',{...event(1),id:NaN})).toBeNull();
    expect(classifySchoolEvent('mayuna',event(1,'ecos.clue',{chain:'fake',step:'seiva'}))).toBeNull();
    expect(classifySchoolEvent('mayuna',event(1,'ecos.clue',{chain:'seiva-azul',step:'seiva',themes:['runas'],relevance:'extraordinary'}))?.relevance).toBe('common');
  });
  it('counts distinct milestones once across retries and repeated crafting', () => {
    const events = [event(1),event(2),event(3,'ecos.craft',{recipe:'unguento-orvalho'}),event(4,'ecos.craft',{recipe:'unguento-orvalho'})];
    const journal = schoolJournal('mayuna',events);
    expect(journal.achievements).toHaveLength(2);
    expect(journal.schools.find(s=>s.id==='arcane')?.progress.count).toBe(1);
    expect(journal.schools.every(s=>s.rank===0 && s.stage==='planned')).toBe(true);
    // Persist/reload round trip: no transient in-memory success.
    expect(schoolJournal('mayuna',JSON.parse(JSON.stringify(events)))).toEqual(journal);
  });
  it('only completed creature analysis contributes, not repeated ordinary kills', () => {
    expect(classifySchoolEvent('a',event(1,'combat.kill',{slug:'wolf',analyzed:false}))).toBeNull();
    expect(classifySchoolEvent('a',event(2,'combat.kill',{slug:'wolf',analyzed:true}))?.themes).toEqual(['registro']);
  });
  it('reads every page even when the API returns fewer than its requested limit', async () => {
    const fetch = vi.fn(async (after:number)=>after===0?[event(1),event(2)]:after===2?[event(3)]:[]);
    expect(await readSchoolEvents(fetch)).toHaveLength(3);
    expect(fetch.mock.calls.map(c=>c[0])).toEqual([0,2,3]);
  });
  it('propagates storage errors and rejects a non-advancing cursor', async () => {
    await expect(readSchoolEvents(async()=>[event(1)])).rejects.toThrow('Paginação');
    await expect(readSchoolEvents(async()=>{throw new Error('offline');})).rejects.toThrow('offline');
  });
  it('scopes queries to the resolved Companion and fixes the scan upper bound', async () => {
    const calls: unknown[][] = []; let page = 0;
    const db = {from:(table:string)=>{
      calls.push(['from',table]);
      const q: any = {};
      for (const name of ['select','eq','in','gt','lte','order']) q[name]=(...args:unknown[])=>{calls.push([name,...args]);return q;};
      q.limit=async(n:number)=>{calls.push(['limit',n]);return {data:page++===0?[{id:2}]:page===2?[event(1)]:[],error:null};};
      return q;
    }};
    const result = await schoolView(db as any,'companion-owned');
    expect(result.schools.companionId).toBe('companion-owned');
    expect(calls.filter(c=>c[0]==='eq' && c[1]==='companion_id')).toEqual(Array(3).fill(['eq','companion_id','companion-owned']));
    expect(calls).toContainEqual(['lte','id',2]);
    expect(calls).toContainEqual(['eq','actor','system']);
  });
  it('never returns empty success when database access fails', async () => {
    const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({error:{message:'denied'},data:null})};
    await expect(schoolView({from:()=>q} as any,'owned')).rejects.toThrow('consultar');
  });
});
