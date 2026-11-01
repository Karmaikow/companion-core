/**
 * Áster no Admin (Servidor): o estado da cidade (de pé ou destruída) e a reconstrução. Enquanto a defesa da cidade
 * não existe, o ADM derruba Áster por aqui (abre uma rodada nova) ou a reergue na hora. A meta (Cristais Ápice,
 * materiais e Lumes) e a chance de cristal em cada tipo de baú ficam em game_config.values.aster.
 */
import { useEffect, useState } from 'react';
import {
  resolveAster, cleanProgress, rebuildRatio, needText, DEFAULT_ASTER, CHEST_TIERS, MATERIALS, CATEGORIES, CRYSTALS_LABEL,
  type AsterConfig, type ChestTier, type CityRebuild,
} from '@rules';
import { supabase } from '../backend/online';
import { LiveActions, ask, useAdminDirty } from './adminKit';

async function invoke(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase().functions.invoke('refuge', { body: { action, ...extra } });
  if (error) {
    let msg = 'Falha ao falar com o servidor.';
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error; } catch { /* mantém */ }
    throw new Error(msg);
  }
  return data as { city: CityRebuild };
}

export function AsterSettings() {
  const [saved, setSaved] = useState<AsterConfig | null>(null);
  const [cfg, setCfg] = useState<AsterConfig>(DEFAULT_ASTER);
  const [city, setCity] = useState<CityRebuild | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const dirty = !!saved && JSON.stringify(saved) !== JSON.stringify(cfg);
  useAdminDirty(dirty);

  const load = async () => {
    const [gc, cr] = await Promise.all([
      supabase().from('game_config').select('values').eq('id', 1).maybeSingle(),
      supabase().from('city_rebuild').select('state,round,progress,destroyed_at,rebuilt_at').eq('city', 'aster').maybeSingle(),
    ]);
    const a = resolveAster((gc.data?.values as { aster?: unknown } | null)?.aster);
    setSaved(a); setCfg(a);
    if (cr.data) setCity({ state: cr.data.state === 'destruida' ? 'destruida' : 'normal', round: Number(cr.data.round) || 0, progress: cleanProgress(cr.data.progress), destroyedAt: cr.data.destroyed_at, rebuiltAt: cr.data.rebuilt_at });
  };
  useEffect(() => { void load(); }, []);

  async function save() {
    setBusy(true); setMsg(null);
    // relê antes de gravar: as outras seções do Servidor também escrevem em game_config.values
    const { data } = await supabase().from('game_config').select('values').eq('id', 1).maybeSingle();
    const uid = (await supabase().auth.getUser()).data.user?.id;
    const next = { ...((data?.values ?? {}) as Record<string, unknown>), aster: resolveAster(cfg) };
    const { error } = await supabase().from('game_config').update({ values: next, updated_at: new Date().toISOString(), updated_by: uid }).eq('id', 1);
    setBusy(false);
    if (error) { setMsg({ text: 'Não consegui salvar: ' + error.message }); return; }
    setSaved(resolveAster(cfg)); setMsg({ ok: true, text: 'Salvo: vale na hora.' });
  }
  async function setState(state: 'destruida' | 'normal') {
    const ok = await ask(state === 'destruida'
      ? { title: 'Derrubar Áster?', body: 'A cidade fica destruída para todos os jogadores e começa uma reconstrução nova (o progresso volta a zero).', confirm: 'Derrubar a cidade', danger: true }
      : { title: 'Reerguer Áster agora?', body: 'A cidade volta ao normal na hora, sem fechar a meta (quem entregou não ganha o prêmio da reconstrução).', confirm: 'Reerguer agora' });
    if (!ok) return;
    setBusy(true); setMsg(null);
    try { const r = await invoke('admin.city', { state }); setCity(r.city); setMsg({ ok: true, text: state === 'destruida' ? 'Áster caiu. A Torre Central já pede a reconstrução.' : 'Áster está de pé.' }); }
    catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); }
  }
  const setTier = (t: ChestTier, p: Partial<AsterConfig['crystals'][ChestTier]>) => setCfg({ ...cfg, crystals: { ...cfg.crystals, [t]: { ...cfg.crystals[t], ...p } } });
  const setGoal = (p: Partial<AsterConfig['rebuild']>) => setCfg({ ...cfg, rebuild: { ...cfg.rebuild, ...p } });
  const down = city?.state === 'destruida';

  return (
    <fieldset>
      <legend>Áster: queda e reconstrução</legend>
      <p className="hint">
        {!city ? 'Lendo a cidade…' : down
          ? `Destruída (rodada ${city.round}) desde ${city.destroyedAt ? new Date(city.destroyedAt).toLocaleString('pt-BR') : '—'} · reconstrução ${Math.round(rebuildRatio(cfg.rebuild, city.progress) * 100)}%: ${city.progress.crystals}/${cfg.rebuild.crystals} cristais, ${city.progress.lumes}/${cfg.rebuild.lumes} Lumes${cfg.rebuild.materials.map((m, i) => `, ${city.progress.materials[i] ?? 0}/${m.qty} ${m.label.toLowerCase()}`).join('')}.`
          : `De pé${city.rebuiltAt ? ` (reconstruída em ${new Date(city.rebuiltAt).toLocaleString('pt-BR')})` : ''}. Enquanto a defesa da cidade não existe, derrube por aqui para abrir a reconstrução.`}
      </p>
      <div className="row">
        {down ? <button className="ghost" disabled={busy} onClick={() => void setState('normal')}>Reerguer agora</button>
          : <button className="ghost danger" disabled={busy || !city} onClick={() => void setState('destruida')}>Derrubar Áster</button>}
        <button className="link" disabled={busy} onClick={() => void load()}>atualizar</button>
      </div>

      <h4>Meta da reconstrução</h4>
      <div className="row-3">
        <label>{CRYSTALS_LABEL}<input type="number" min={0} max={99999} value={cfg.rebuild.crystals} onChange={(e) => setGoal({ crystals: Number(e.target.value) || 0 })} /></label>
        <label>Lumes<input type="number" min={0} max={9999999} value={cfg.rebuild.lumes} onChange={(e) => setGoal({ lumes: Number(e.target.value) || 0 })} /></label>
      </div>
      {cfg.rebuild.materials.map((m, i) => (
        <div key={i} className="list-row">
          <input className="grow" value={m.label} onChange={(e) => setGoal({ materials: cfg.rebuild.materials.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} maxLength={40} aria-label="Nome na Torre" />
          <select value={m.material ? 'm:' + m.material : 'c:' + m.category} onChange={(e) => { const [t, v] = e.target.value.split(':'); setGoal({ materials: cfg.rebuild.materials.map((x, k) => (k === i ? (t === 'm' ? { label: x.label, qty: x.qty, material: v } : { label: x.label, qty: x.qty, category: v as never }) : x)) }); }} aria-label="Material">
            <optgroup label="Qualquer da categoria">{Object.entries(CATEGORIES).filter(([c]) => Object.values(MATERIALS).some((x) => x.category === c)).map(([c, v]) => <option key={c} value={'c:' + c}>{v.icon} {v.label}</option>)}</optgroup>
            <optgroup label="Material">{Object.values(MATERIALS).map((x) => <option key={x.id} value={'m:' + x.id}>{CATEGORIES[x.category].icon} {x.name}</option>)}</optgroup>
          </select>
          <label>qtd <input type="number" min={1} max={9999} value={m.qty} onChange={(e) => setGoal({ materials: cfg.rebuild.materials.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) || 1 } : x)) })} /></label>
          <button className="link" onClick={() => setGoal({ materials: cfg.rebuild.materials.filter((_, k) => k !== i) })}>tirar</button>
        </div>
      ))}
      <button className="ghost" disabled={cfg.rebuild.materials.length >= 8} onClick={() => setGoal({ materials: [...cfg.rebuild.materials, { label: 'Material', material: 'bloco-lapidado', qty: 5 }] })}>+ Material</button>
      <small className="hint">Resumo: {[`${cfg.rebuild.crystals} ${CRYSTALS_LABEL}`, `${cfg.rebuild.lumes} Lumes`, ...cfg.rebuild.materials.map((m) => `${m.qty}× ${needText(m)}`)].join(' · ')}. Mudar a meta vale na hora, inclusive para a reconstrução em andamento.</small>

      <h4>Cristais nos baús de monstro</h4>
      {(Object.keys(CHEST_TIERS) as ChestTier[]).map((t) => (
        <div key={t} className="list-row">
          <span className="grow">{CHEST_TIERS[t].label} <small className="hint">({t === 'comum' ? 'monstros comuns' : t === 'raro' ? 'elites e chefes' : 'MVP'})</small></span>
          <label>chance <input type="number" min={0} max={100} step={1} value={Math.round(cfg.crystals[t].chance * 100)} onChange={(e) => setTier(t, { chance: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 })} /> %</label>
          <label>qtd <input type="number" min={1} max={20} value={cfg.crystals[t].qty} onChange={(e) => setTier(t, { qty: Number(e.target.value) || 1 })} /></label>
        </div>
      ))}
      <LiveActions section dirty={dirty} busy={busy} msg={msg} saveLabel="Salvar Áster" dirtyText="Áster não salva" onUndo={() => saved && setCfg(saved)} onSave={() => void save()}
        confirm={() => ({ title: 'Salvar a meta e os cristais de Áster?', body: 'Vale na hora para todos os jogadores.', confirm: 'Salvar' })} />
    </fieldset>
  );
}
