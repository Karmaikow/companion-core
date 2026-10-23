/** HUD do mundo: brasão do lugar, relógio do jogo e a missão da vez (com a dica para avançar). */
import { useEffect, useState } from 'react';
import { QUESTS, gameTime, questHelp, suggestedClass, SPECIES, DEFAULT_CONFIG } from '@rules';
import { useGame } from '../store';
import { HudGlyph } from './HudGlyph';

export function LocationHud({ place, region }: { place: 'refuge' | 'world'; region: string | null }) {
  const name = useGame((s) => s.snap?.companion?.discoveries.name);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 15000); return () => window.clearInterval(t); }, []);
  const t = gameTime(now);
  const day = t.phase === 'manha' || t.phase === 'tarde';
  return <>
    <div className="location-crest deco"><span aria-hidden="true">◆</span>{place === 'refuge' ? 'Refúgio' + (name ? ' de ' + name : '') : region ?? 'Companion World'}<span aria-hidden="true">◆</span></div>
    <div className="game-clock deco" title={'Horário do mundo · dia ' + (t.day + 1)}><HudGlyph kind={day ? 'sun' : 'moon'} /><time>{String(t.hour).padStart(2, '0')}:{String(t.minute).padStart(2, '0')}</time></div>
  </>;
}

/** A quest da vez, com o que fazer (as mesmas dicas que aparecem sobre a caixa de conversa). */
export function useQuestHelp() {
  const snap = useGame((s) => s.snap);
  const c = snap?.companion;
  if (!c || !snap?.quests) return null;
  const last = String([...(snap.timeline ?? [])].reverse().find((e) => e.kind === 'chat.companion')?.payload.text ?? '');
  const form = c.discoveries.form;
  return questHelp(snap.quests, c.discoveries, {
    bondLevel: c.bond.level, firstBondLevel: snap.config?.firstBondLevel ?? DEFAULT_CONFIG.firstBondLevel,
    suggested: suggestedClass(last), affinities: form ? SPECIES[form].affinities : [],
  });
}

export function QuestTracker() {
  const quests = useGame((s) => s.snap?.quests);
  const setTab = useGame((s) => s.setTab);
  const help = useQuestHelp();
  if (!help || !quests) return null;
  const done = quests.filter((q) => q.status === 'done').length;
  return (
    <button className="quest-tracker" onClick={() => setTab('quests')} aria-label={'Abrir quest: ' + help.title}>
      <span className="quest-diamond" aria-hidden="true"><HudGlyph kind="quest" /></span>
      <span><strong>{help.title}</strong><small>{help.hint}</small><em>{done}/{QUESTS.length} quests</em></span>
    </button>
  );
}
