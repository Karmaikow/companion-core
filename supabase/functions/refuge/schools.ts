import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { SCHOOL_EVENT_KINDS, schoolJournal, type SchoolSourceEvent } from './rules/combat/schoolJournal.ts';

/** Read only after getCompanion has resolved ownership. Never accept a CID from the body here. */
export async function readSchoolEvents(fetchPage: (after: number) => Promise<SchoolSourceEvent[]>) {
  const events: SchoolSourceEvent[] = [];
  let after = 0;
  while (true) {
    const page = await fetchPage(after);
    if (!page.length) break;
    const next = page[page.length - 1].id;
    if (!Number.isSafeInteger(next) || next <= after) throw new Error('Paginação inválida do diário de escolas.');
    events.push(...page); after = next;
  }
  return events;
}
export async function schoolView(db: SupabaseClient, companionId: string) {
  // Fix the upper bound so new events cannot make this request scan indefinitely.
  const top = await db.from('companion_events').select('id').eq('companion_id', companionId).order('id', {ascending:false}).limit(1);
  if (top.error) throw new Error('Não foi possível consultar as conquistas das escolas.');
  const maximum = top.data?.[0]?.id ?? 0;
  const events = await readSchoolEvents(async after => {
    const result = await db.from('companion_events').select('id,actor,kind,payload,created_at')
      .eq('companion_id', companionId).eq('actor', 'system').in('kind', [...SCHOOL_EVENT_KINDS])
      .gt('id', after).lte('id', maximum).order('id', {ascending:true}).limit(500);
    if (result.error) throw new Error('Não foi possível carregar as conquistas das escolas.');
    return result.data ?? [];
  });
  return { schools: schoolJournal(companionId, events) };
}
