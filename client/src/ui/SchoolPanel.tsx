/**
 * Escolas de Áster: o modal que abre quando o Companion chega à porta de uma escola (marcador "escola" do Estúdio
 * da Cidade). Matrícula, e a bancada de cada uma:
 *  - Escola da Forja (Taurinas): a Forja Primordial, encomendas e reforja — o único lugar onde se forja;
 *  - Escola do Veneno (Natureza ou Água): poções e comidas com as plantas coletadas, e as técnicas de veneno.
 * As regras ficam em shared/rules/escolas.ts; o servidor confere tudo.
 */
import { SkillIcon } from './SkillIcon';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { CITY_SCHOOLS, BREWS, MAX_BREW, MATERIALS, brewCheck, goodById, schoolBlock, schoolSkills, parseBatchKey, equippedItems, ITEM_TYPES, WEAPON_TECHNIQUES, TECHNIQUE_SCHOOL, COMBO_LINKS, finisherBySlug, type CitySchool, type SpeciesKey } from '@rules';
import { useGame } from '../store';
import { usePacto, uuid } from '../pacto/pactoStore';
import { useEcos, bagBatches } from '../ecos/ecosStore';
import { useSkills } from './skillState';
import { ForgeBench, Jobs, Orders, Pieces } from './PactoPanel';
import { MissionList } from './MissionsPanel';
import type { PactoView } from '../pacto/types';

export const useSchool = create<{ open: { name: string; school: CitySchool } | null }>(() => ({ open: null }));
export const openSchool = (name: string, school: CitySchool) => useSchool.setState({ open: { name, school } });
const close = () => useSchool.setState({ open: null });

const formsOf = (v: PactoView): SpeciesKey[] => (v.cls.forms?.length ? v.cls.forms : v.cls.effective ? [v.cls.effective] : []);
const essOf = (v: PactoView) => (v.cls.essences?.length ? v.cls.essences : [v.cls.essence]);

export function SchoolPanel() {
  const open = useSchool((s) => s.open);
  const view = usePacto((s) => s.view);
  const busy = usePacto((s) => s.busy);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => { if (!open) return; setMsg(null); void usePacto.getState().refresh(); void useEcos.getState().refresh(); }, [open]);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open]);
  if (!open) return null;
  const info = CITY_SCHOOLS[open.school];
  // a arma na mão (Escola Arcana pede cajado de duas mãos T4 para a matrícula; quem já estuda não perde por trocar de arma)
  const held = useHeld();
  const studying = !!view?.schools?.includes(open.school);
  const block = view ? schoolBlock(open.school, formsOf(view), essOf(view), studying ? undefined : held) : null;
  const enrolled = studying && !block;

  const join = async () => {
    setMsg(null);
    const r = await usePacto.getState().call('pacto.school.join', { school: open.school });
    if (!r?.school) { setMsg({ text: usePacto.getState().error ?? 'Não deu certo.', ok: false }); usePacto.getState().clear(); return; }
    useGame.getState().toast(`Matrícula na ${info.label}!`, 'gold');
  };

  return (
    <div className="shop-back" role="dialog" aria-modal="true" aria-label={open.name} onClick={close}>
      <div className={'shop school framed' + (enrolled && open.school === 'forja' ? ' wide' : '')} onClick={(e) => e.stopPropagation()}>
        <header className="shop-head">
          <div className="shop-face" aria-hidden>{info.icon}</div>
          <div className="shop-who">
            <h2>{open.name}</h2>
            <small>{info.master} · {info.focus}</small>
            <p className="shop-say">{enrolled ? '“Bem-vindo(a) de volta. A bancada é sua.”' : `“${info.who} É de graça; o trabalho é que custa.”`}</p>
          </div>
          {view && <div className="pacto-lumes" title="Lumes: a moeda de Áster e do Pacto">✧ <b>{view.lumes}</b> Lumes</div>}
          <button className="close" onClick={close} aria-label="Fechar">✕</button>
        </header>
        {view?.simulated && <p className="shop-note">Offline: tudo simulado neste aparelho, sem valor online.</p>}
        {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')} role="status">{msg.text}</p>}
        {!view ? <p className="hint">Abrindo a escola…</p>
          : block ? <p className="hint">{block}</p>
          : !enrolled ? (
            <div className="school-join">
              <p className="hint">{open.school === 'forja'
                ? 'A Escola da Forja é o único lugar onde equipamentos são forjados, reforjados e encomendas são aceitas.'
                : open.school === 'arcana' ? 'A Escola Arcana ensina as técnicas arcanas do cajado: Seta Arcana, Selo Rúnico e Explosão Arcana, e o combo Prisão Rúnica.'
                : 'A Escola do Veneno ensina a preparar poções e comidas com as plantas coletadas, e as técnicas Cuspe Tóxico e Névoa Venenosa.'}</p>
              <button className="primary" disabled={!!busy} onClick={join}>Matricular-se</button>
            </div>
          )
          : open.school === 'forja' ? <ForgeSchool view={view} /> : open.school === 'arcana' ? <ArcaneSchool /> : <PoisonSchool view={view} busy={!!busy} setMsg={setMsg} />}
      </div>
    </div>
  );
}

/** Arma na mão direita (tipo, tier, duas mãos), para as escolas que pedem arma. */
function useHeld() {
  const equipped = useGame((s) => s.equipped), items = useGame((s) => s.items);
  const w = equippedItems(equipped, items).find((x) => x.slot === 'mainhand' && ITEM_TYPES[x.item.type].weapon)?.item;
  return w ? { type: w.type, tier: w.tier, twoHanded: !!ITEM_TYPES[w.type].weapon?.twoHanded } : null;
}

function ArcaneSchool() {
  const bond = useGame((s) => s.snap?.companion?.bond.level ?? 1);
  const techs = WEAPON_TECHNIQUES.filter((t) => TECHNIQUE_SCHOOL[t.slug] === 'arcana');
  const combos = COMBO_LINKS.filter((l) => l.weapon === 'cajado');
  return (
    <div className="shop-list">
      <p className="hint">Técnicas arcanas do cajado. Entram sozinhas na barra (1–9) com um cajado na mão, quando o vínculo chega ao nível pedido. Saem com o elemento do seu Companion e evoluem com o tier do cajado (Habilidades → Essência e evolução).</p>
      {techs.map((s) => (
        <div key={s.slug} className="shop-row">
          <span className="shop-icon" aria-hidden><SkillIcon skill={s} size={40} /></span>
          <div className="shop-info"><b>{s.name}</b><small>{s.description}</small></div>
          <small>{s.unlockBond <= bond ? '✓ aprendida' : `vínculo ${s.unlockBond}`}</small>
        </div>
      ))}
      {combos.map((l) => <p key={l.becomes} className="hint">Combo: <b>{WEAPON_TECHNIQUES.find((t) => t.slug === l.from)?.name} → {WEAPON_TECHNIQUES.find((t) => t.slug === l.press)?.name}</b> = {finisherBySlug(l.becomes)?.name}</p>)}
    </div>
  );
}

function ForgeSchool({ view }: { view: PactoView }) {
  const bag = useEcos((s) => s.view?.bag) ?? [];
  const [tab, setTab] = useState<'forja' | 'encomendas' | 'pecas' | 'missoes'>('forja');
  const [order, setOrder] = useState<string | null>(null);
  return (
    <div className="pacto">
      <nav className="st-tabs pacto-tabs" aria-label="Escola da Forja">
        <button className={tab === 'forja' ? 'on' : ''} onClick={() => setTab('forja')}>Forja</button>
        <button className={tab === 'encomendas' ? 'on' : ''} onClick={() => setTab('encomendas')}>Encomendas</button>
        <button className={tab === 'pecas' ? 'on' : ''} onClick={() => setTab('pecas')}>Peças</button>
        <button className={tab === 'missoes' ? 'on' : ''} onClick={() => setTab('missoes')}>Missões</button>
      </nav>
      {tab !== 'missoes' && <Jobs view={view} />}
      {tab === 'forja' && <ForgeBench view={view} bag={bag} orderId={order} setOrder={setOrder} />}
      {tab === 'encomendas' && <Orders view={view} bag={bag} onForge={(id) => { setOrder(id); setTab('forja'); }} />}
      {tab === 'pecas' && <Pieces view={view} bag={bag} atForge />}
      {tab === 'missoes' && <MissionList giver="escola-forja" />}
    </div>
  );
}

function PoisonSchool({ view, busy, setMsg }: { view: PactoView; busy: boolean; setMsg: (m: { text: string; ok: boolean } | null) => void }) {
  const ecos = useEcos((s) => s.view);
  const bag = bagBatches(ecos);
  const catalog = useSkills((s) => s.catalog);
  const bond = useGame((s) => s.snap?.companion?.bond.level ?? 1);
  const [tab, setTab] = useState<'bancada' | 'tecnicas' | 'missoes'>('bancada');
  const [times, setTimes] = useState<Record<string, number>>({});
  const have = (material: string) => bag.filter((b) => parseBatchKey(b.key)?.material === material).reduce((a, b) => a + b.qty, 0);

  const brew = async (id: string, n: number) => {
    setMsg(null);
    const r = await usePacto.getState().call('pacto.school.brew', { request: uuid(), recipe: id, times: n });
    if (!r?.brewed) { setMsg({ text: usePacto.getState().error ?? 'Não deu certo.', ok: false }); usePacto.getState().clear(); return; }
    void useGame.getState().run((b) => b.state()); void useEcos.getState().refresh();
    const g = goodById(r.brewed.good)!;
    setMsg({ text: `Pronto: ${r.brewed.qty}× ${g.name}${r.brewed.bonus ? ' (plantas de potência alta: +1 por preparo!)' : ''}`, ok: true });
    useGame.getState().toast(`${g.icon} +${r.brewed.qty} ${g.name}`, 'gold');
  };

  return (
    <>
      <nav className="st-tabs" aria-label="Escola do Veneno">
        <button className={tab === 'bancada' ? 'on' : ''} onClick={() => setTab('bancada')}>Bancada</button>
        <button className={tab === 'tecnicas' ? 'on' : ''} onClick={() => setTab('tecnicas')}>Técnicas</button>
        <button className={tab === 'missoes' ? 'on' : ''} onClick={() => setTab('missoes')}>Missões</button>
      </nav>
      {tab === 'missoes' ? <MissionList giver="escola-veneno" /> : <div className="shop-list">
        {tab === 'bancada' ? (
          <>
            <p className="hint">Usa as plantas da mochila de coleta (as de maior potência primeiro). Se todas tiverem potência alta, sai uma a mais por preparo. As receitas grandes pedem refinados da Casa dos Ecos e a Erva Lunar (que a missão da escola ensina a achar). O que você prepara vai para a bolsa.</p>
            {BREWS.map((r) => {
              const g = goodById(r.good)!, n = times[r.id] ?? 1;
              const chk = brewCheck(r, n, bag);
              return (
                <div key={r.id} className="shop-row">
                  <span className="shop-icon" aria-hidden>{g.icon}</span>
                  <div className="shop-info">
                    <b>{r.qty}× {g.name}</b>
                    <small>{r.inputs.map((i) => `${i.qty * n}× ${MATERIALS[i.material].name} (tem ${have(i.material)})`).join(' · ')}</small>
                  </div>
                  <input type="number" className="shop-qty" min={1} max={MAX_BREW} value={n} onChange={(e) => setTimes({ ...times, [r.id]: Math.max(1, Math.min(MAX_BREW, Math.round(Number(e.target.value) || 1))) })} aria-label="Vezes" />
                  <button className="primary" disabled={busy || !chk.ok} title={chk.ok ? 'Preparar' : chk.reason} onClick={() => void brew(r.id, n)}>Preparar</button>
                </div>
              );
            })}
          </>
        ) : (
          <>
            <p className="hint">Técnicas ensinadas aqui. Elas entram na sua barra de habilidades (1–9) quando o vínculo chega ao nível pedido.</p>
            {schoolSkills(catalog, ['veneno']).map((s) => (
              <div key={s.slug} className="shop-row">
                <span className="shop-icon" aria-hidden><SkillIcon skill={s} size={40} /></span>
                <div className="shop-info"><b>{s.name}</b><small>{s.description}</small></div>
                <small>{s.unlockBond <= bond ? '✓ aprendida' : `vínculo ${s.unlockBond}`}</small>
              </div>
            ))}
          </>
        )}
      </div>}
    </>
  );
}
