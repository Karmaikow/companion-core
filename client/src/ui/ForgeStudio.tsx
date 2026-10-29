/**
 * Forja de Batalha (painel do ADM): o catálogo de habilidades genéricas. Cada habilidade serve a uma essência (ou a
 * todas) e a um ou mais tipos de corpo (ou a todos); a prévia mostra o aviso no chão, o efeito e o acerto nos bonecos.
 * "Kit de exemplo" mostra o que um Companion de essência e corpo escolhidos receberia em cada nível de vínculo.
 */
import { lazy, Suspense, useMemo, useState } from 'react';
import {
  DEFAULT_SKILLS, ELEMENTS, SLOTS, SHAPES, STATUSES, VFX_STYLES, BODIES, ANIM_KINDS, CLASS_LABELS, SPECIES, sanitizeSkill, kitFor, biomeSlug,
  type SkillDef, type SkillSlot, type SkillShape, type StatusKey, type VfxStyle, type Element, type BodyPlan, type SpeciesKey,
} from '@rules';
import { ForgeVfxEditor } from './ForgeVfxEditor';
import { useCatalog } from './catalog';

import { animKey, useAnimMap, useCompanionModels } from './companionModels';
const SkillPreview = lazy(() => import('../scene/SkillFx').then((m) => ({ default: m.SkillPreview })));
const ESS = Object.keys(ELEMENTS) as Element[];

export function ForgeStudio() {
  const cat = useCatalog<SkillDef>('skills', sanitizeSkill);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<SkillDef | null>(null);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [filter, setFilter] = useState<Element | 'todas' | 'neutras'>('todas');
  const [newName, setNewName] = useState('');
  const models = useCompanionModels();
  const [trainer, setTrainer] = useState('');
  const trainerModel = models?.find((m) => m.companionId === trainer) ?? null;
  const trainerAnims = useAnimMap(trainer || null);
  const [compColor, setCompColor] = useState('#9fc9ff');
  const [defEss, setDefEss] = useState<Element | ''>('');
  const [kitEss, setKitEss] = useState<Element>('fogo');
  const [kitClass, setKitClass] = useState<SpeciesKey>('serpente');
  const [kitBond, setKitBond] = useState(5);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [restart, setRestart] = useState(0);
  const [dark, setDark] = useState(true);

  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await f(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); }
  };
  const pick = (slug: string) => {
    if (dirty && !window.confirm('Há mudanças não salvas. Trocar mesmo assim?')) return;
    const r = cat.rows?.find((x) => x.slug === slug);
    setSel(slug); setDraft(r ? structuredClone(r.data) : null); setStatus(r?.status ?? 'draft'); setDirty(false); setMsg(null);
  };
  const edit = (p: Partial<SkillDef>) => { setDraft((d) => (d ? { ...d, ...p } : d)); setDirty(true); };
  function create() {
    const slug = biomeSlug(newName);
    if (!newName.trim()) return;
    if (cat.rows?.some((r) => r.slug === slug)) { setMsg({ text: `Já existe "${slug}".` }); return; }
    const base = sanitizeSkill({ ...DEFAULT_SKILLS[0], slug, name: newName.trim(), description: '', slot: 'essence', essence: filter !== 'todas' && filter !== 'neutras' ? filter : null, power: 50, energy: 20, cooldown: 4 })!;
    setSel(slug); setDraft(base); setStatus('draft'); setDirty(true); setNewName('');
  }

  // catálogo novo (Companions humanoides por classe): habilidades que faltam e classes que as antigas não tinham
  const pendingDefaults = useMemo(() => DEFAULT_SKILLS.filter((d) => {
    const r = cat.rows?.find((x) => x.slug === d.slug);
    return !r || (!r.data.classes.length && d.classes.length);
  }), [cat.rows]);
  const missingDefaults = pendingDefaults.length;
  async function syncDefaults() {
    for (const d of pendingDefaults) {
      const r = cat.rows?.find((x) => x.slug === d.slug);
      await cat.save(r ? { ...r.data, classes: d.classes, description: r.data.description || d.description } : d, r?.status ?? 'published');
    }
  }

  const rows = (cat.rows ?? []).filter((r) => filter === 'todas' || (filter === 'neutras' ? !r.data.essence : r.data.essence === filter));
  const published = useMemo(() => (cat.rows ?? []).filter((r) => r.status === 'published').map((r) => (r.slug === draft?.slug ? draft : r.data)), [cat.rows, draft]);
  const kit = useMemo(() => kitFor(published.length ? published : DEFAULT_SKILLS, { essence: kitEss, body: 'biped', bond: kitBond, species: kitClass }), [published, kitEss, kitClass, kitBond]);
  const clean = useMemo(() => (draft ? sanitizeSkill(draft) : null), [draft]);

  return (
    <div className="biome-studio forge-workspace">
      <aside className="biome-list">
        <h2>Forja de Batalha</h2>
        <small className="hint">Habilidades genéricas: cada uma serve a uma essência (ou todas) e a classes de Companion e corpos de monstro escolhidos (ou todos). Companions são humanoides: a animação é sempre um clipe de humanoide; o que muda é a forma e o efeito.</small>
        {cat.error && <p className="msg err">{cat.error}</p>}
        {cat.rows && !cat.rows.length && (
          <button className="primary" disabled={busy} onClick={() => void run(() => cat.saveMany(DEFAULT_SKILLS, 'published'), `${DEFAULT_SKILLS.length} habilidades carregadas e publicadas.`)}>
            Carregar o catálogo inicial ({DEFAULT_SKILLS.length} habilidades)
          </button>
        )}
        {cat.rows && cat.rows.length > 0 && missingDefaults > 0 && (
          <button className="ghost" disabled={busy} onClick={() => void run(syncDefaults, 'Catálogo atualizado: classes de Companion e habilidades novas.')}>
            Atualizar com o catálogo novo ({missingDefaults} mudança{missingDefaults > 1 ? 's' : ''}: classes humanoides)
          </button>
        )}
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filtrar por essência">
          <option value="todas">Todas as essências</option>
          <option value="neutras">Neutras (qualquer Companion)</option>
          {ESS.map((e) => <option key={e} value={e}>{ELEMENTS[e].label}</option>)}
        </select>
        {(Object.keys(SLOTS) as SkillSlot[]).map((slot) => {
          const list = rows.filter((r) => r.data.slot === slot);
          if (!list.length) return null;
          return (
            <div key={slot} className="biome-group">
              <h3>{SLOTS[slot]}</h3>
              <ul>
                {list.map((r) => (
                  <li key={r.slug}>
                    <button className={sel === r.slug ? 'on' : ''} onClick={() => pick(r.slug)}>
                      <strong><i className="look-dot" style={{ background: r.data.essence ? ELEMENTS[r.data.essence].glow : compColor }} />{r.name}</strong>
                      <small>{SHAPES[r.data.shape]} · {r.data.classes.length || r.data.bodies.length ? [...r.data.classes.map((k) => CLASS_LABELS[k]), ...(r.data.bodies.length ? ['monstros: ' + r.data.bodies.map((b) => BODIES[b]).join(', ')] : [])].join(' · ') : 'todos'}{r.status === 'draft' ? ' · rascunho' : ''}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        <form className="biome-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova habilidade" maxLength={40} aria-label="Nome da nova habilidade" />
          <button className="primary" disabled={!newName.trim()}>Criar</button>
        </form>

        <fieldset className="kit-box">
          <legend>Kit de exemplo</legend>
          <div className="chips">
            <select value={kitEss} onChange={(e) => setKitEss(e.target.value as Element)} aria-label="Essência">{ESS.map((e) => <option key={e} value={e}>{ELEMENTS[e].label}</option>)}</select>
            <select value={kitClass} onChange={(e) => setKitClass(e.target.value as SpeciesKey)} aria-label="Classe">{(Object.keys(CLASS_LABELS) as SpeciesKey[]).map((k) => <option key={k} value={k}>{CLASS_LABELS[k]}</option>)}</select>
            <label>vínculo <input type="number" min={1} max={20} value={kitBond} onChange={(e) => setKitBond(Number(e.target.value))} style={{ width: 52 }} /></label>
          </div>
          <ul className="kit-list">
            <li><span>Básico</span>{kit.basic?.name ?? '—'}</li>
            <li><span>Essência</span>{kit.essence.map((s) => s.name).join(' · ') || '—'}</li>
            <li><span>Forma</span>{kit.form?.name ?? '—'}</li>
            <li><span>Suprema</span>{kit.supreme?.name ?? '—'}</li>
            {kit.locked.length > 0 && <li className="locked"><span>Abre depois</span>{kit.locked.map((s) => `${s.name} (vínculo ${s.unlockBond})`).join(' · ')}</li>}
          </ul>
          {!published.length && <small className="hint">Usando o catálogo inicial (nada publicado ainda).</small>}
        </fieldset>
      </aside>

      {!draft || !clean ? (
        <section className="biome-empty"><p>Escolha uma habilidade para editar e ver a prévia, ou crie uma nova.</p></section>
      ) : (
        <section className="biome-editor">
          <div className="biome-preview">
            <Suspense fallback={<div className="art-empty">Carregando prévia…</div>}>
              <SkillPreview paused={paused} speed={speed} restart={restart} dark={dark} skill={clean} companionColor={compColor} defenderEssence={defEss || null} body={trainerModel ? { url: trainerModel.url, anim: animKey(trainerAnims[clean.slug]), companionId: trainerModel.companionId } : null} />
            </Suspense>
            <div className="preview-tools">
              <label>Campo de treino <select value={trainer} onChange={(e) => setTrainer(e.target.value)} aria-label="Quem testa a habilidade">
                <option value="">boneco padrão</option>
                {(models ?? []).map((m) => <option key={m.companionId} value={m.companionId}>{m.name}</option>)}
              </select></label>
              <label>Cor do Companion <input type="color" value={compColor} onChange={(e) => setCompColor(e.target.value)} /></label>
              <label>Boneco de <select value={defEss} onChange={(e) => setDefEss(e.target.value as Element | '')}><option value="">sem essência</option>{ESS.map((e) => <option key={e} value={e}>{ELEMENTS[e].label}</option>)}</select></label>
            </div>
          </div>

          <div className="vfx-playback" aria-label="Reprodução da prévia">
            <button type="button" aria-pressed={paused} onClick={() => setPaused((v) => !v)}>{paused ? 'Continuar' : 'Pausar'}</button>
            <button type="button" onClick={() => { setRestart((v) => v + 1); setPaused(false); }}>Reiniciar</button>
            <label>Velocidade<select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={0.25}>0,25×</option><option value={0.5}>0,5×</option><option value={1}>1×</option></select></label>
            <label><input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> Arena escura</label>
          </div>
          <div className="biome-form">
            <ForgeVfxEditor key={draft.slug} skill={clean} onChange={(vfx) => edit({ vfx })} />
            <div className="row-3">
              <label>Nome<input value={draft.name} onChange={(e) => edit({ name: e.target.value })} maxLength={40} /></label>
              <label>Espaço<select value={draft.slot} onChange={(e) => edit({ slot: e.target.value as SkillSlot })}>{Object.entries(SLOTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label>Status<span className={'pill ' + status}>{status === 'published' ? 'Publicada' : 'Rascunho'}</span></label>
            </div>
            <label>Descrição (o que o jogador lê)<textarea rows={2} value={draft.description} onChange={(e) => edit({ description: e.target.value })} maxLength={200} /></label>

            <fieldset>
              <legend>Quem pode usar</legend>
              <div className="grid-form">
                <label>Essência<select value={draft.essence ?? ''} onChange={(e) => edit({ essence: (e.target.value || null) as Element | null })}><option value="">Neutra (qualquer; cor do Companion)</option>{ESS.map((e) => <option key={e} value={e}>{ELEMENTS[e].label}</option>)}</select></label>
                <label>Abre no vínculo<input type="number" min={1} max={20} value={draft.unlockBond} onChange={(e) => edit({ unlockBond: Number(e.target.value) })} /></label>
              </div>
              <div className="chips" role="group" aria-label="Classes">
                <span className="hint">Classes de Companion:</span>
                {(Object.keys(CLASS_LABELS) as SpeciesKey[]).map((k) => {
                  const on = draft.classes.includes(k);
                  return <button key={k} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} title={SPECIES[k].lineage} onClick={() => edit({ classes: on ? draft.classes.filter((x) => x !== k) : [...draft.classes, k] })}>{CLASS_LABELS[k]}</button>;
                })}
              </div>
              <div className="chips" role="group" aria-label="Corpos">
                <span className="hint">Corpos de monstro:</span>
                {(Object.keys(BODIES) as BodyPlan[]).map((b) => {
                  const on = draft.bodies.includes(b);
                  return <button key={b} type="button" className={'chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => edit({ bodies: on ? draft.bodies.filter((x) => x !== b) : [...draft.bodies, b] })}>{BODIES[b]}</button>;
                })}
                {!draft.bodies.length && !draft.classes.length && <small className="hint">nada marcado = todos os Companions e monstros</small>}
              </div>
            </fieldset>

            <fieldset>
              <legend>Forma e números</legend>
              <div className="grid-form">
                <label>Forma<select value={draft.shape} onChange={(e) => edit({ shape: e.target.value as SkillShape })}>{Object.entries(SHAPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                {['melee', 'cone', 'line', 'circle', 'projectile', 'dash', 'leap'].includes(draft.shape) && <label>Alcance (m)<input type="number" step={0.1} min={0.5} max={15} value={draft.range} onChange={(e) => edit({ range: Number(e.target.value) })} /></label>}
                {draft.shape !== 'melee' && draft.shape !== 'cone' && <label>{draft.shape === 'line' || draft.shape === 'dash' ? 'Meia largura (m)' : 'Raio (m)'}<input type="number" step={0.1} min={0.2} max={8} value={draft.radius} onChange={(e) => edit({ radius: Number(e.target.value) })} /></label>}
                {draft.shape === 'cone' && <label>Abertura (°)<input type="number" min={15} max={180} value={draft.angle} onChange={(e) => edit({ angle: Number(e.target.value) })} /></label>}
                <label>Dano base<input type="number" min={0} max={400} value={draft.power} onChange={(e) => edit({ power: Number(e.target.value) })} /></label>
                <label>Cura<input type="number" min={0} max={400} value={draft.heal} onChange={(e) => edit({ heal: Number(e.target.value) })} /></label>
                <label>Energia<input type="number" min={0} max={100} value={draft.energy} onChange={(e) => edit({ energy: Number(e.target.value) })} /></label>
                <label>Recarga (s)<input type="number" step={0.1} min={0.3} max={60} value={draft.cooldown} onChange={(e) => edit({ cooldown: Number(e.target.value) })} /></label>
                <label>Aviso no chão (s)<input type="number" step={0.05} min={0} max={3} value={draft.windup} onChange={(e) => edit({ windup: Number(e.target.value) })} /></label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Estado e visual</legend>
              <div className="grid-form">
                <label>Estado aplicado<select value={draft.status?.key ?? ''} onChange={(e) => edit({ status: e.target.value ? { key: e.target.value as StatusKey, chance: draft.status?.chance ?? 0.5, seconds: draft.status?.seconds ?? 3 } : null })}>
                  <option value="">Nenhum</option>
                  {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}{v.good ? ' (bom, em si/aliados)' : ''}</option>)}
                </select></label>
                {draft.status && <label>Chance (%)<input type="number" min={0} max={100} value={Math.round(draft.status.chance * 100)} onChange={(e) => edit({ status: { ...draft.status!, chance: Number(e.target.value) / 100 } })} /></label>}
                {draft.status && <label>Duração (s)<input type="number" step={0.5} min={0.5} max={15} value={draft.status.seconds} onChange={(e) => edit({ status: { ...draft.status!, seconds: Number(e.target.value) } })} /></label>}
                <label>Animação<select value={draft.anim} onChange={(e) => edit({ anim: e.target.value as SkillDef['anim'] })}>{ANIM_KINDS.filter((a) => ['attack', 'jump', 'run', 'happy'].includes(a.kind)).map((a) => <option key={a.kind} value={a.kind}>{a.label}</option>)}<option value="special">Especial</option></select></label>
                <label>Efeito<select value={draft.vfx.style} onChange={(e) => edit({ vfx: { ...draft.vfx, style: e.target.value as VfxStyle } })}>{Object.entries(VFX_STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>Cor<select value={draft.vfx.color === 'essence' || draft.vfx.color === 'companion' ? draft.vfx.color : 'hex'} onChange={(e) => edit({ vfx: { ...draft.vfx, color: e.target.value === 'hex' ? '#ffd56b' : e.target.value } })}>
                  <option value="essence">Da essência</option><option value="companion">Do Companion</option><option value="hex">Fixa…</option>
                </select></label>
                {draft.vfx.color.startsWith('#') && <label>Cor fixa<input type="color" value={draft.vfx.color} onChange={(e) => edit({ vfx: { ...draft.vfx, color: e.target.value } })} /></label>}
              </div>
              {draft.status && <small className="hint">{STATUSES[draft.status.key].effect}</small>}
            </fieldset>

            {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')}>{msg.text}</p>}
            <div className="row">
              <button className="primary" disabled={busy || !dirty} onClick={() => void run(async () => { await cat.save(draft, status); setDirty(false); }, 'Salva.')}>Salvar</button>
              {status === 'draft'
                ? <button className="secondary" disabled={busy} onClick={() => void run(async () => { await cat.save(draft, 'published'); setStatus('published'); setDirty(false); }, 'Publicada.')}>Salvar e publicar</button>
                : <button className="ghost" disabled={busy} onClick={() => void run(async () => { await cat.save(draft, 'draft'); setStatus('draft'); setDirty(false); }, 'Voltou para rascunho.')}>Tirar do jogo</button>}
              <button className="link" disabled={busy} onClick={() => { if (window.confirm(`Apagar "${draft.name}"?`)) void run(async () => { await cat.remove(draft.slug); setSel(null); setDraft(null); setDirty(false); }, 'Apagada.'); }}>apagar</button>
              {dirty && <small className="msg">Não salva: a prévia já mostra.</small>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
