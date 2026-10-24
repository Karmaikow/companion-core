/**
 * Atributos do monstro por nível (Invocador): os valores do nível 1, o crescimento por nível de cada atributo e a
 * tabela do nível mínimo ao máximo. Mudar uma célula fixa aquele valor naquele nível (fica destacada); entre dois
 * valores fixados a tabela vai em linha reta e, depois do último, segue o crescimento. Apagar a célula solta o valor.
 */
import { useRef, useState } from 'react';
import {
  creatureStatsAt, pinnedStat, statGrowth, mitigate, CREATURE_STAT_KEYS, CREATURE_STAT_RULES,
  type CreatureDef, type CreatureStatKey, type CreatureStats,
} from '@rules';

const fmt = (k: CreatureStatKey, v: number) => (k === 'atkSpeed' ? v.toFixed(2).replace('.', ',') : String(v));
const parse = (s: string) => Number(s.replace(',', '.'));

export function CreatureStatsEditor({ draft, clean, edit }: { draft: CreatureDef; clean: CreatureDef; edit: (p: Partial<CreatureDef>) => void }) {
  const [from, to] = clean.level;
  const [all, setAll] = useState(false);
  // a tabela mostra a faixa da criatura; "ver até o 60" ajuda a planejar outra faixa
  const last = all ? 60 : to;
  const levels = Array.from({ length: Math.max(1, last - Math.min(from, 1) + 1) }, (_, i) => i + 1).filter((l) => l >= (all ? 1 : from) && l <= last);
  const pins = draft.levelStats ?? {};

  const setPin = (lv: number, k: CreatureStatKey, raw: string) => {
    const next: Record<string, Partial<CreatureStats>> = structuredClone(pins);
    const row = { ...(next[String(lv)] ?? {}) };
    if (raw.trim() === '' || !Number.isFinite(parse(raw))) delete row[k]; else row[k] = parse(raw);
    if (Object.keys(row).length) next[String(lv)] = row; else delete next[String(lv)];
    // o nível 1 é a base: fixar nele muda os atributos base
    if (lv === 1 && row[k] !== undefined) {
      edit({ stats: { ...draft.stats, [k]: row[k] }, levelStats: (() => { const n2 = { ...next }; const r1 = { ...(n2['1'] ?? {}) }; delete r1[k]; if (Object.keys(r1).length) n2['1'] = r1; else delete n2['1']; return Object.keys(n2).length ? n2 : undefined; })() });
      return;
    }
    edit({ levelStats: Object.keys(next).length ? next : undefined });
  };
  const setGrowth = (k: CreatureStatKey, pct: string) => {
    const g = { ...(draft.growth ?? {}) };
    const v = parse(pct);
    if (pct.trim() === '' || !Number.isFinite(v)) delete g[k]; else g[k] = v / 100;
    edit({ growth: Object.keys(g).length ? g : undefined });
  };
  const pinCount = Object.values(pins).reduce((n, r) => n + Object.keys(r).length, 0);

  return (
    <div className="stats-editor">
      <div className="grid-form">
        {CREATURE_STAT_KEYS.map((k) => {
          const r = CREATURE_STAT_RULES[k];
          return (
            <label key={k}>{r.label} (nv 1)
              <input type="number" step={r.step} min={r.min} max={r.max} value={draft.stats[k]} onChange={(e) => edit({ stats: { ...draft.stats, [k]: Number(e.target.value) } })} />
              <span className="growth">
                <input type="number" step={0.5} min={-20} max={50} aria-label={`Crescimento de ${r.label} por nível (%)`}
                  value={Math.round(statGrowth(draft, k) * 1000) / 10}
                  onChange={(e) => setGrowth(k, e.target.value)} />% por nível
              </span>
            </label>
          );
        })}
      </div>
      <div className="stats-table-tools">
        <small className="hint">Mude qualquer célula para fixar o valor naquele nível (fica destacada). Entre dois valores fixados vai em linha reta; depois do último segue o % por nível. Apague a célula para soltar.</small>
        <label className="inline"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> ver do 1 ao 60</label>
        {pinCount > 0 && <button className="link" onClick={() => edit({ levelStats: undefined })}>soltar todos ({pinCount})</button>}
      </div>
      <div className="stats-table-wrap">
        <table className="stats-table">
          <thead>
            <tr><th>Nv</th>{CREATURE_STAT_KEYS.map((k) => <th key={k}>{CREATURE_STAT_RULES[k].label}</th>)}<th title="Dano de um golpe num Companion sem defesa">Golpe</th></tr>
          </thead>
          <tbody>
            {levels.map((lv) => {
              const st = creatureStatsAt(clean, lv);
              const out = lv < from || lv > to;
              return (
                <tr key={lv} className={out ? 'out' : ''}>
                  <th>{lv}</th>
                  {CREATURE_STAT_KEYS.map((k) => {
                    const pinned = lv === 1 || pinnedStat(clean, lv, k) !== undefined;
                    return (
                      <td key={k} className={pinned ? 'pinned' : ''}>
                        <StatCell value={fmt(k, st[k])} onCommit={(raw) => setPin(lv, k, raw)} label={`${CREATURE_STAT_RULES[k].label} no nível ${lv}`} />
                      </td>
                    );
                  })}
                  <td className="blow">~{mitigate(st.poder, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Célula editável: só grava ao sair do campo ou com Enter (digitar "1" de "150" não fixa 1). */
function StatCell({ value, onCommit, label }: { value: string; onCommit: (raw: string) => void; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const cancel = useRef(false);
  const commit = () => { if (!cancel.current && text !== null && text !== value) onCommit(text); cancel.current = false; setText(null); };
  return (
    <input inputMode="decimal" aria-label={label} value={text ?? value}
      onFocus={(e) => { setText(value); e.target.select(); }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { cancel.current = true; (e.target as HTMLInputElement).blur(); } }} />
  );
}
