import { ELEMENTS, QUESTS, gameTime } from '@rules';
import { useGame } from '../store';
import { HudGlyph } from './HudGlyph';

export function LocationHud({ place, region, now }: { place: 'refuge' | 'world'; region: string | null; now: number }) {
  const name = useGame((s) => s.snap?.companion?.discoveries.name);
  const t = gameTime(now);
  const day = t.phase === 'manha' || t.phase === 'tarde';
  return <>
    <div className="location-crest"><span aria-hidden="true">◇</span>{place === 'refuge' ? 'Refúgio' + (name ? ' de ' + name : '') : region ?? 'Companion World'}<span aria-hidden="true">◇</span></div>
    <div className="game-clock" title={'Horário do mundo · dia ' + (t.day + 1)}><HudGlyph kind={day ? 'sun' : 'moon'} /><time>{String(t.hour).padStart(2, '0')}:{String(t.minute).padStart(2, '0')}</time></div>
  </>;
}

export function QuestTracker() {
  const quests = useGame((s) => s.snap?.quests);
  const setTab = useGame((s) => s.setTab);
  const next = quests?.find((q) => q.status !== 'completed');
  const def = QUESTS.find((q) => q.key === next?.key);
  if (!def) return null;
  const done = quests?.filter((q) => q.status === 'completed').length ?? 0;
  return <button className="quest-tracker" onClick={() => setTab('quests')} aria-label={'Abrir missão: ' + def.title}>
    <span className="quest-diamond" aria-hidden="true">◇</span><span><strong>{def.title}</strong><small>{def.discovery} · {done}/{QUESTS.length}</small></span>
  </button>;
}

export function BondTrack() {
  const c = useGame((s) => s.snap?.companion);
  if (!c) return null;
  const { bond } = c;
  const ratio = Math.max(0, Math.min(1, bond.ratio));
  return <div className="bond-track" title="Experiência de vínculo" aria-label={'Vínculo nível ' + bond.level}>
    <div className="bond-track-line" role="progressbar" aria-label="Progresso de vínculo" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}><i style={{ width: ratio * 100 + '%' }} /></div>
    <small>Vínculo {bond.level}<span>XP {Math.max(0, bond.xp - bond.from).toLocaleString('pt-BR')} / {Math.max(1, bond.to - bond.from).toLocaleString('pt-BR')}</span></small>
  </div>;
}
