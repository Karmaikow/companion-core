/** Modelos 3D de Companion já enviados na Fábrica (para os campos de treino do Administrador). */
import { useEffect, useState } from 'react';
import { supabase } from '../backend/online';

export interface CompanionModelRef { companionId: string; name: string; url: string; status: string }

let cache: CompanionModelRef[] | null = null;

export function useCompanionModels() {
  const [list, setList] = useState<CompanionModelRef[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    supabase().functions.invoke('refuge', { body: { action: 'admin.jobs' } }).then(({ data }) => {
      const jobs = ((data as { jobs?: { companionId: string; name: string; status: string; model?: { url: string } }[] })?.jobs ?? []);
      const seen = new Set<string>(), out: CompanionModelRef[] = [];
      for (const j of jobs) if (j.model?.url && !seen.has(j.companionId)) { seen.add(j.companionId); out.push({ companionId: j.companionId, name: j.name, url: j.model.url, status: j.status }); }
      cache = out; if (alive) setList(out);
    }, () => alive && setList([]));
    return () => { alive = false; };
  }, []);
  return list;
}

/** Animações escolhidas no Administrador para um Companion (por habilidade e "__basic"). */
export function useAnimMap(companionId: string | null) {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!companionId) { setMap({}); return; }
    let alive = true;
    supabase().from('companion_skill_anims').select('anims').eq('companion_id', companionId).maybeSingle().then(({ data }) => { if (alive) setMap((data?.anims ?? {}) as Record<string, string>); }, () => {});
    return () => { alive = false; };
  }, [companionId]);
  return map;
}

/** "clip:<nome>" | "kind:<tipo>" → chave de animação do modelo de treino. */
export const animKey = (v: string | undefined) => (!v ? null : v.startsWith('kind:') ? v.slice(5) : v);
