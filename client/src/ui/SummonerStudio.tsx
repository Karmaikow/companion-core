/**
 * Invocador de Monstros (painel do ADM): o catálogo de criaturas do Companion World. Corpo (.GLB com animações,
 * imagem ou névoa), aparência, essência e jeito de lutar, habilidades da Forja com frequência, onde e quando aparece,
 * e o que solta ao ser acalmada. Publicada, a criatura já anda pelas regiões marcadas.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_CREATURES, DEFAULT_SKILLS, WORLD_FALLBACK_BIOMES, ELEMENTS, BODIES, ARCHETYPES, TEMPERAMENTS, BATTLE_STYLES, TIMES, ANIM_KINDS,
  sanitizeCreature, sanitizeSkill, rigForBody, type CreatureRig, sanitizeBiome, kitFor, MOTIONS, biomeSlug, animKind, creatureStatsAt, creatureSkillsAt, mitigate,
  type CreatureDef, type Motion, type Archetype, type Temperament, type BattleStyle, type TimeOfDay, type Element, type BodyPlan, type SkillDef,
} from '@rules';
import { supabase } from '../backend/online';
import { useCatalog, uploadWorldAsset, safeName } from './catalog';
import { LookEditor } from './BiomeStudio';
import { AutoRig, glbHasRig } from './RigEditor';
import { CreaturePromptGen, RigSelect } from './CreaturePromptGen';
import { CreatureStatsEditor } from './CreatureStatsEditor';

const CreaturePreview = lazy(() => import('../scene/CreaturePreview').then((m) => ({ default: m.CreaturePreview })));
const ESS = Object.keys(ELEMENTS) as Element[];
const ACTS: [string, string][] = [['idle', 'Parado'], ['walk', 'Andando'], ['run', 'Correndo'], ['attack', 'Ataque'], ['hurt', 'Ferido'], ['happy', 'Feliz']];

export function SummonerStudio() {
  const cat = useCatalog<CreatureDef>('creatures', sanitizeCreature);
  const skills = useCatalog<SkillDef>('skills', sanitizeSkill);
  const [biomes, setBiomes] = useState<{ slug: string; name: string }[]>([]);
  useEffect(() => {
    void supabase().from('biomes').select('slug,name,settings,status').then(({ data }) => {
      const world = (data ?? []).map((b) => sanitizeBiome(b)).filter((b) => b.settings.kind === 'world' || b.slug === 'refugio').map((b) => ({ slug: b.slug, name: b.name }));
      const extra = WORLD_FALLBACK_BIOMES.slice(1).filter((b) => !world.some((w) => w.slug === b.slug)).map((b) => ({ slug: b.slug, name: b.name + ' (reserva)' }));
      setBiomes([...world, ...extra]);
    });
  }, []);
  const skillList = skills.rows?.length ? skills.rows.map((r) => r.data) : DEFAULT_SKILLS;

  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<CreatureDef | null>(null);
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [newName, setNewName] = useState('');
  const [act, setAct] = useState('idle');
  const [lookOpen, setLookOpen] = useState(false);

  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await f(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ text: (e as Error).message }); } finally { setBusy(false); }
  };
  const pick = (slug: string) => {
    if (dirty && !window.confirm('Há mudanças não salvas. Trocar mesmo assim?')) return;
    const r = cat.rows?.find((x) => x.slug === slug);
    setSel(slug); setDraft(r ? structuredClone(r.data) : null); setStatus(r?.status ?? 'draft'); setDirty(false); setMsg(null);
    if (r) setRig(rigForBody(r.data.body));
  };
  const edit = (p: Partial<CreatureDef>) => { setDraft((d) => (d ? { ...d, ...p } : d)); setDirty(true); };
  function create() {
    const slug = biomeSlug(newName);
    if (!newName.trim()) return;
    if (cat.rows?.some((r) => r.slug === slug)) { setMsg({ text: `Já existe "${slug}".` }); return; }
    const base = sanitizeCreature({ ...DEFAULT_CREATURES[0], slug, name: newName.trim(), description: '', drops: [], biomes: [], color: '#b9a6ff' })!;
    setSel(slug); setDraft(base); setStatus('draft'); setDirty(true); setNewName(''); setRig(rigForBody(base.body));
  }

  // esqueleto do rig automático (começa pelo tipo de corpo); modelo enviado sem rig ganha o rig sozinho
  const [rig, setRig] = useState<CreatureRig>('fox');
  const [rigUrl, setRigUrl] = useState<string | null>(null);
  async function uploadModel(files: File[], asAnims: boolean, rigged?: boolean) {
    if (!draft) return;
    const glbs = files.filter((f) => /\.glb$/i.test(f.name));
    if (!glbs.length) { setMsg({ text: 'Envie arquivos .GLB.' }); return; }
    const needsRig = !asAnims && !(rigged ?? await glbHasRig(glbs[0]));
    await run(async () => {
      const ups = [];
      for (const f of glbs) ups.push({ f, ...(await uploadWorldAsset(`creatures/${draft.slug}/${Date.now()}-${safeName(f.name)}.glb`, f)) });
      if (!asAnims) {
        const main = ups[0], kind = animKind(main.f.name);
        edit({ model: { url: main.url, path: main.path, anims: kind ? [{ url: main.url, path: main.path, kind, name: main.f.name }] : [] } });
        if (needsRig) setRigUrl(main.url);
      } else {
        const model = draft.model!;
        edit({ model: { ...model, anims: [...model.anims, ...ups.map((u) => ({ url: u.url, path: u.path, kind: animKind(u.f.name) ?? 'special', name: u.f.name }))] } });
      }
    }, asAnims ? 'Animações adicionadas (o tipo vem do nome; confira e salve).' : needsRig ? 'Modelo enviado; fazendo o rig automático…' : 'Modelo enviado. Salve para valer.');
  }
  async function uploadArt(f: File) {
    if (!draft) return;
    await run(async () => {
      const ext = /\.png$/i.test(f.name) ? 'png' : /\.webp$/i.test(f.name) ? 'webp' : 'jpg';
      const up = await uploadWorldAsset(`creatures/${draft.slug}/${Date.now()}-${safeName(f.name)}.${ext}`, f);
      edit({ art: up });
    }, 'Imagem enviada. Sem modelo 3D, ela aparece como sprite no mundo.');
  }

  const clean = useMemo(() => (draft ? sanitizeCreature(draft) : null), [draft]);
  const totalW = draft?.skills.reduce((t, s) => t + s.weight, 0) || 1;
  const lv = clean ? creatureStatsAt(clean, clean.level[1]) : null;

  return (
    <div className="biome-studio">
      <aside className="biome-list">
        <h2>Invocador de Monstros</h2>
        <small className="hint">As criaturas do Companion World (as Brumas do design de batalha: acalmadas, não mortas). Publicadas, já andam nas regiões marcadas.</small>
        {cat.error && <p className="msg err">{cat.error}</p>}
        {cat.rows && !cat.rows.length && (
          <button className="primary" disabled={busy} onClick={() => void run(() => cat.saveMany(DEFAULT_CREATURES, 'published'), 'Criaturas de exemplo publicadas.')}>Carregar 3 criaturas de exemplo</button>
        )}
        <ul>
          {cat.rows?.map((r) => (
            <li key={r.slug}>
              <button className={sel === r.slug ? 'on' : ''} onClick={() => pick(r.slug)}>
                <strong><i className="look-dot" style={{ background: r.data.color }} />{r.name}</strong>
                <small>{ARCHETYPES[r.data.archetype].label} · {TEMPERAMENTS[r.data.temperament].label} · nv {r.data.level[0]}–{r.data.level[1]}{r.data.model ? ' · 3D' : r.data.art ? ' · imagem' : ' · slime'}{r.status === 'draft' ? ' · rascunho' : ''}</small>
              </button>
            </li>
          ))}
        </ul>
        <form className="biome-new" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nova criatura" maxLength={50} aria-label="Nome da nova criatura" />
          <button className="primary" disabled={!newName.trim()}>Invocar</button>
        </form>
      </aside>

      {!draft || !clean ? (
        <section className="biome-empty"><p>Escolha uma criatura ou invoque uma nova. Sem modelo nem imagem, ela aparece como um slime de gelatina na cor escolhida (o rosto muda com o temperamento e o enfeite no topo com a essência).</p></section>
      ) : (
        <section className="biome-editor">
          <div className="biome-preview">
            <Suspense fallback={<div className="art-empty">Carregando prévia…</div>}>
              <CreaturePreview def={clean} act={act} />
            </Suspense>
            <div className="preview-tools">
              {ACTS.map(([k, v]) => <button key={k} className={'chip' + (act === k ? ' on' : '')} onClick={() => setAct(k)}>{v}</button>)}
              <small>silhueta = Companion de 1 m</small>
            </div>
          </div>

          <div className="biome-form">
            <div className="row-3">
              <label>Nome<input value={draft.name} onChange={(e) => edit({ name: e.target.value })} maxLength={50} /></label>
              <label>Cor<input type="color" value={draft.color} onChange={(e) => edit({ color: e.target.value })} /></label>
              <label>Status<span className={'pill ' + status}>{status === 'published' ? 'Publicada' : 'Rascunho'}</span></label>
            </div>
            <label>Descrição (bestiário)<textarea rows={2} value={draft.description} onChange={(e) => edit({ description: e.target.value })} maxLength={300} /></label>

            <fieldset>
              <legend>Corpo</legend>
              <div className="grid-form">
                <label>Tipo de corpo<select value={draft.body} onChange={(e) => { edit({ body: e.target.value as BodyPlan }); setRig(rigForBody(e.target.value as BodyPlan)); }}>{(Object.keys(BODIES) as BodyPlan[]).map((b) => <option key={b} value={b}>{BODIES[b]}</option>)}</select></label>
                <label>Altura (m)<input type="number" step={0.1} min={0.2} max={12} value={draft.size} onChange={(e) => edit({ size: Number(e.target.value) })} /></label>
              </div>
              <div className="model-box">
                {draft.model ? <small className="ok">Modelo 3D: {decodeURIComponent(draft.model.url.split('/').pop() ?? '')}</small> : <small>Sem modelo 3D. Envie o .GLB do Tripo sem rig: o esqueleto escolhido é encaixado aqui, sozinho, com as animações dele.</small>}
                <div className="row">
                  <label className="upload"><input type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void uploadModel(fs, false); }} />{draft.model ? 'Trocar modelo .GLB' : 'Enviar modelo .GLB'}</label>
                  {draft.model && <label className="upload"><input type="file" accept=".glb,model/gltf-binary" multiple disabled={busy} onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (fs.length) void uploadModel(fs, true); }} />+ Animações .GLB</label>}
                  <label className="inline">Esqueleto<RigSelect value={rig} onChange={setRig} disabled={busy} /></label>
                  {draft.model && <button className="link" disabled={busy} onClick={() => setRigUrl(draft.model!.url)} title="Encaixa o esqueleto escolhido de novo, sozinho, com as animações dele">refazer o rig automático</button>}
                  {draft.model && <button className="link" onClick={() => edit({ model: undefined })}>tirar modelo</button>}
                  {rigUrl && <AutoRig url={rigUrl} name={draft.name} rig={rig} onClose={() => setRigUrl(null)} onDone={async (file) => { await uploadModel([file], false, true); setRigUrl(null); setMsg({ ok: true, text: 'Rig automático pronto, com as animações do esqueleto. Confira na prévia e salve.' }); }} />}
                </div>
                {draft.model && draft.model.anims.length > 0 && (
                  <ul className="anim-list">
                    {draft.model.anims.map((a, i) => (
                      <li key={a.url + i}>
                        <span title={a.name}>{a.name || a.url.split('/').pop()}</span>
                        <select value={a.kind} onChange={(e) => edit({ model: { ...draft.model!, anims: draft.model!.anims.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)) } })} aria-label="Tipo da animação">
                          {ANIM_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}<option value="special">Especial</option>
                        </select>
                        <button className="link" onClick={() => edit({ model: { ...draft.model!, anims: draft.model!.anims.filter((_, j) => j !== i) } })}>tirar</button>
                      </li>
                    ))}
                  </ul>
                )}
                {draft.art ? <img className="thumb" src={draft.art.url} alt={`Imagem de ${draft.name}`} /> : null}
                <div className="row">
                  <label className="upload"><input type="file" accept="image/png,image/webp,image/jpeg" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadArt(f); }} />{draft.art ? 'Trocar imagem / sprite' : 'Enviar imagem / sprite (PNG com fundo transparente)'}</label>
                  {draft.art && <button className="link" onClick={() => edit({ art: undefined })}>tirar imagem</button>}
                </div>
                <button className={'link' + (draft.look ? ' tinted' : '')} onClick={() => setLookOpen(!lookOpen)} aria-expanded={lookOpen}><i className="look-dot" style={{ background: draft.look ? draft.look.tint : 'transparent' }} />aparência do modelo (cor, luz, brilho)</button>
                {lookOpen && <LookEditor look={draft.look} onChange={(look) => edit({ look })} />}
                {draft.model && (
                  <label>Movimento por código
                    <select value={draft.motion} onChange={(e) => edit({ motion: e.target.value as Motion })}>{(Object.keys(MOTIONS) as Motion[]).map((k) => <option key={k} value={k}>{MOTIONS[k].label}</option>)}</select>
                    <small className="hint">{draft.model.anims.length ? 'Usado nas ações que o modelo não tem (ex.: tem "parado" mas não "andar").' : 'Este .GLB não tem animações: o corpo inteiro se mexe por código.'} {MOTIONS[draft.motion].hint}. Veja na prévia trocando a ação.</small>
                  </label>
                )}
              </div>
            </fieldset>
            <fieldset>
              <legend>Prompt do modelo 3D</legend>
              <details>
                <summary>Gerar o prompt pela imagem de referência e pelo tipo</summary>
                <CreaturePromptGen name={draft.name} color={draft.color} element={draft.essence ? ELEMENTS[draft.essence].label : undefined} rig={rig} onRig={setRig} />
              </details>
            </fieldset>

            <fieldset>
              <legend>Batalha</legend>
              <div className="grid-form">
                <label>Essência<select value={draft.essence ?? ''} onChange={(e) => edit({ essence: (e.target.value || null) as Element | null })}><option value="">Nenhuma</option>{ESS.map((e) => <option key={e} value={e}>{ELEMENTS[e].label}</option>)}</select></label>
                <label>Arquétipo<select value={draft.archetype} onChange={(e) => edit({ archetype: e.target.value as Archetype })}>{Object.entries(ARCHETYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
                <label>Temperamento<select value={draft.temperament} onChange={(e) => edit({ temperament: e.target.value as Temperament })}>{Object.entries(TEMPERAMENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
                <label>Estilo<select value={draft.style} onChange={(e) => edit({ style: e.target.value as BattleStyle })}>{Object.entries(BATTLE_STYLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>Nível mín.<input type="number" min={1} max={60} value={draft.level[0]} onChange={(e) => edit({ level: [Number(e.target.value), draft.level[1]] })} /></label>
                <label>Nível máx.<input type="number" min={1} max={60} value={draft.level[1]} onChange={(e) => edit({ level: [draft.level[0], Number(e.target.value)] })} /></label>
                <label>Percebe a (m)<input type="number" step={0.5} min={1} max={30} value={draft.aggroRange} onChange={(e) => edit({ aggroRange: Number(e.target.value) })} /></label>
              </div>
              <small className="hint">{ARCHETYPES[draft.archetype].hint} · {TEMPERAMENTS[draft.temperament].hint}</small>
            </fieldset>

            <fieldset>
              <legend>Atributos por nível</legend>
              <CreatureStatsEditor draft={draft} clean={clean} edit={edit} />
              <div className="grid-form">
                <label>Velocidade de movimento (m/s)<input type="number" step={0.1} min={0.2} max={6} value={draft.speed} onChange={(e) => edit({ speed: Number(e.target.value) })} /><small className="hint">correndo atrás: ×1,6</small></label>
              </div>
              {lv && <small className="hint">No nível {clean!.level[1]}: vida {lv.vida} · ataque {lv.poder} · defesa {lv.defesa} · um golpe tira ~{mitigate(lv.poder, 0)} de HP do Companion</small>}
            </fieldset>

            <fieldset>
              <legend>Árvore de habilidades (da Forja)</legend>
              <small className="hint">Cada habilidade abre num nível do monstro e pode depender de outra (a de antes precisa estar aberta). O peso é a frequência entre as abertas.</small>
              {draft.skills.map((s, i) => {
                const def = skillList.find((x) => x.slug === s.slug);
                const set = (patch: Partial<CreatureDef['skills'][number]>) => edit({ skills: draft.skills.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                return (
                  <div key={i} className="list-row tree-row">
                    <select className="grow" value={s.slug} onChange={(e) => set({ slug: e.target.value })} aria-label="Habilidade">
                      {!def && <option value={s.slug}>{s.slug} (não existe na Forja)</option>}
                      {skillList.map((k) => <option key={k.slug} value={k.slug}>{k.name}{k.essence ? ` · ${ELEMENTS[k.essence].label}` : ''}</option>)}
                    </select>
                    <label>abre no nv <input type="number" min={1} max={60} value={s.level ?? 1} onChange={(e) => set({ level: Number(e.target.value) })} style={{ width: 56 }} /></label>
                    <label>depois de <select value={s.after ?? ''} onChange={(e) => set({ after: e.target.value || undefined })}>
                      <option value="">— (raiz)</option>
                      {draft.skills.filter((x, j) => j !== i && x.slug !== s.slug).map((x) => <option key={x.slug} value={x.slug}>{skillList.find((k) => k.slug === x.slug)?.name ?? x.slug}</option>)}
                    </select></label>
                    <label>peso <input type="range" min={0} max={5} step={0.5} value={s.weight} onChange={(e) => set({ weight: Number(e.target.value) })} /></label>
                    <small>{Math.round((s.weight / totalW) * 100)}%</small>
                    <button className="link" onClick={() => edit({ skills: draft.skills.filter((_, j) => j !== i).map((x) => (x.after === s.slug ? { ...x, after: undefined } : x)) })}>tirar</button>
                  </div>
                );
              })}
              {clean && clean.skills.length > 0 && (
                <div className="mtree" aria-label="Árvore">
                  {[...new Set(clean.skills.map((x) => x.level))].sort((a, b) => a - b).map((lvl) => (
                    <div key={lvl} className="mtree-tier">
                      <b>nv {lvl}</b>
                      {clean.skills.filter((x) => x.level === lvl).map((x) => (
                        <span key={x.slug} className="mtree-node">{x.after && <i>↳ {skillList.find((k) => k.slug === x.after)?.name ?? x.after}</i>}{skillList.find((k) => k.slug === x.slug)?.name ?? x.slug}</span>
                      ))}
                    </div>
                  ))}
                  <small className="hint">No nível {clean.level[0]}: {creatureSkillsAt(clean, clean.level[0]).map((x) => skillList.find((k) => k.slug === x.slug)?.name ?? x.slug).join(', ') || 'nenhuma'} · no nível {clean.level[1]}: {creatureSkillsAt(clean, clean.level[1]).map((x) => skillList.find((k) => k.slug === x.slug)?.name ?? x.slug).join(', ') || 'nenhuma'}</small>
                </div>
              )}
              <div className="row">
                <button className="link" disabled={draft.skills.length >= 12} onClick={() => edit({ skills: [...draft.skills, { slug: skillList[0]?.slug ?? 'golpe', weight: 1, level: 1 }] })}>+ habilidade</button>
                <button className="link" onClick={() => {
                  const k = kitFor(skillList, { essence: draft.essence, body: draft.body, bond: 20 });
                  const lo = draft.level[0], hi = draft.level[1], mid = Math.round((lo + hi) / 2);
                  const list: CreatureDef['skills'] = [];
                  if (k.basic) list.push({ slug: k.basic.slug, weight: 3, level: lo });
                  k.essence.forEach((s, i) => list.push({ slug: s.slug, weight: 1.5, level: i === 0 ? lo : mid, ...(list.length ? { after: list[list.length - 1].slug } : {}) }));
                  if (k.form) list.push({ slug: k.form.slug, weight: 1, level: hi, ...(list.length ? { after: list[list.length - 1].slug } : {}) });
                  edit({ skills: list });
                }}>sugerir pela essência e corpo</button>
              </div>
            </fieldset>

            <fieldset>
              <legend>Onde e quando aparece</legend>
              <div className="chips" role="group" aria-label="Regiões">
                {biomes.map((b) => {
                  const cur = draft.biomes.find((x) => x.slug === b.slug);
                  return <button key={b.slug} type="button" className={'chip' + (cur ? ' on' : '')} aria-pressed={!!cur} onClick={() => edit({ biomes: cur ? draft.biomes.filter((x) => x.slug !== b.slug) : [...draft.biomes, { slug: b.slug, weight: 1 }] })}>{b.name}</button>;
                })}
              </div>
              <small className="hint">{draft.biomes.length ? 'Só nas regiões marcadas.' : 'Nenhuma marcada = qualquer região do mundo (mais rara).'}</small>
              <div className="grid-form">
                <label>Horário<select value={draft.time} onChange={(e) => edit({ time: e.target.value as TimeOfDay })}>{Object.entries(TIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label>Grupo mín.<input type="number" min={1} max={12} value={draft.group[0]} onChange={(e) => edit({ group: [Number(e.target.value), draft.group[1]] })} /></label>
                <label>Grupo máx.<input type="number" min={1} max={12} value={draft.group[1]} onChange={(e) => edit({ group: [draft.group[0], Number(e.target.value)] })} /></label>
                <label>Volta depois de (s)<input type="number" min={5} max={3600} step={5} value={draft.respawn} onChange={(e) => edit({ respawn: Number(e.target.value) })} /><small className="hint">{draft.respawn >= 60 ? `${Math.floor(draft.respawn / 60)} min${draft.respawn % 60 ? ` ${draft.respawn % 60} s` : ''}` : `${draft.respawn} s`} depois de derrotada, no mesmo canto</small></label>
                <label>Raridade<select value={String(draft.rarity)} onChange={(e) => edit({ rarity: Number(e.target.value) })}>
                  {[[1, 'Comum'], [0.5, 'Incomum'], [0.2, 'Rara'], [0.05, 'Lendária']].map(([v, l]) => <option key={v} value={String(v)}>{l}</option>)}
                  {![1, 0.5, 0.2, 0.05].includes(draft.rarity) && <option value={String(draft.rarity)}>{draft.rarity}</option>}
                </select></label>
              </div>
            </fieldset>

            <fieldset>
              <legend>O que solta ao ser acalmada</legend>
              {draft.drops.map((d, i) => (
                <div key={i} className="list-row">
                  <input className="grow" value={d.item} onChange={(e) => edit({ drops: draft.drops.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)) })} placeholder="Item (ex.: Pelo gelado)" maxLength={40} aria-label="Item" />
                  <label>chance <input type="number" min={0} max={100} value={Math.round(d.chance * 100)} onChange={(e) => edit({ drops: draft.drops.map((x, j) => (j === i ? { ...x, chance: Number(e.target.value) / 100 } : x)) })} />%</label>
                  <label>qtd <input type="number" min={1} max={99} value={d.min} onChange={(e) => edit({ drops: draft.drops.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) } : x)) })} />–<input type="number" min={1} max={99} value={d.max} onChange={(e) => edit({ drops: draft.drops.map((x, j) => (j === i ? { ...x, max: Number(e.target.value) } : x)) })} /></label>
                  <button className="link" onClick={() => edit({ drops: draft.drops.filter((_, j) => j !== i) })}>tirar</button>
                </div>
              ))}
              <button className="link" disabled={draft.drops.length >= 10} onClick={() => edit({ drops: [...draft.drops, { item: '', chance: 0.5, min: 1, max: 1 }] })}>+ item</button>
              <small className="hint">Ingredientes das receitas e materiais. Itens vazios são ignorados ao salvar.</small>
            </fieldset>

            {msg && <p className={'msg' + (msg.ok ? ' ok' : ' err')}>{msg.text}</p>}
            <div className="row">
              <button className="primary" disabled={busy || !dirty} onClick={() => void run(async () => { await cat.save(draft, status); setDirty(false); }, 'Salva.')}>Salvar</button>
              {status === 'draft'
                ? <button className="secondary" disabled={busy} onClick={() => void run(async () => { await cat.save(draft, 'published'); setStatus('published'); setDirty(false); }, 'Publicada: já aparece no Companion World.')}>Salvar e publicar</button>
                : <button className="ghost" disabled={busy} onClick={() => void run(async () => { await cat.save(draft, 'draft'); setStatus('draft'); setDirty(false); }, 'Saiu do mundo (rascunho).')}>Tirar do mundo</button>}
              <button className="link" disabled={busy} onClick={() => { if (window.confirm(`Apagar "${draft.name}"?`)) void run(async () => { await cat.remove(draft.slug); setSel(null); setDraft(null); setDirty(false); }, 'Apagada.'); }}>apagar</button>
              {dirty && <small className="msg">Não salva: a prévia já mostra.</small>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
