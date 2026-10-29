import { useState } from 'react';
import { ForgeSpellCatalogue } from './ForgeSpellCatalogue';
import { VFX_LAYER_KINDS, newVfxLayer, vfxPreset, type SkillDef, type VfxLayerDef } from '@rules';
import './forge-vfx.css';

export function ForgeVfxEditor({ skill, onChange }: { skill: SkillDef; onChange: (vfx: SkillDef['vfx']) => void }) {
  const layers = skill.vfx.layers ?? [];
  const [kind, setKind] = useState<VfxLayerDef['kind']>('crystals');
  const update = (next: VfxLayerDef[]) => onChange({ ...skill.vfx, layers: next });
  const edit = (i: number, patch: Partial<VfxLayerDef>) => update(layers.map((l, j) => j === i ? { ...l, ...patch } : l));
  const end = Math.max(1, ...layers.map((l) => (l.phase === 'prepare' ? 0 : skill.windup) + l.delay + l.duration + (l.anchor === 'path' ? 0.45 : 0)));
  return <fieldset className="forge-vfx">
    <legend>Laboratório de VFX</legend>
    <ForgeSpellCatalogue skill={skill} onChange={onChange} />
    <p className="hint">Camadas sobre o efeito principal. Os ajustes são salvos com a habilidade; dano e área de acerto continuam na folha de batalha.</p>
    <div className="vfx-presets"><span>Composições</span>{([['ice', 'Cristais glaciais'], ['storm', 'Tempestade arcana'], ['ember', 'Brasas vivas']] as const).map(([id, label]) =>
      <button type="button" key={id} onClick={() => { if (!layers.length || window.confirm('Substituir as camadas atuais por esta composição?')) update(vfxPreset(id)); }}>{label}</button>)}
    </div>
    <div className="vfx-score" aria-label="Linha do tempo das camadas">
      <small>Preparação → lançamento em {skill.windup.toFixed(2)} s · fim visual em até {end.toFixed(2)} s</small>
      {layers.map((l, i) => <div className="vfx-track" key={i} style={{ opacity: l.enabled ? 1 : 0.4 }}>
        <span>{i + 1}. {VFX_LAYER_KINDS[l.kind]}</span><div><i style={{ left: `${((l.phase === 'prepare' ? 0 : skill.windup) + l.delay) / end * 100}%`, width: `${(l.duration + (l.anchor === 'path' ? 0.45 : 0)) / end * 100}%`, background: l.color === 'skill' ? '#9bceee' : l.color }} /></div>
      </div>)}
    </div>
    {layers.map((l, i) => <details key={i} className="vfx-layer" open>
      <summary>{i + 1}. {VFX_LAYER_KINDS[l.kind]} · {l.enabled ? 'ativa' : 'desativada'}</summary>
      <div className="vfx-layer-actions"><label><input type="checkbox" checked={l.enabled} onChange={(e) => edit(i, { enabled: e.target.checked })} /> Ativa</label><button type="button" onClick={() => update(layers.filter((_, j) => j !== i))}>Remover camada {i + 1}</button></div>
      <div className="grid-form">
        <label>Início<select value={l.phase} onChange={(e) => edit(i, { phase: e.target.value as VfxLayerDef['phase'] })}><option value="prepare">Preparação</option><option value="launch">Lançamento</option></select></label>
        <label>Local<select value={l.anchor} onChange={(e) => edit(i, { anchor: e.target.value as VfxLayerDef['anchor'] })}><option value="origin">Conjurador</option><option value="target">Alvo / centro da aura</option><option value="path">Trajeto até o alvo</option></select></label>
        <label>Atraso (s)<input type="number" min={0} max={2} step={0.05} value={l.delay} onChange={(e) => edit(i, { delay: Math.min(2, Math.max(0, Number(e.target.value))) })} /></label>
        <label>Duração (s)<input type="number" min={0.15} max={3} step={0.05} value={l.duration} onChange={(e) => edit(i, { duration: Math.min(3, Math.max(0.15, Number(e.target.value))) })} /></label>
        <label>Escala visual · {l.size.toFixed(2)}×<input type="range" min={0.25} max={2} step={0.05} value={l.size} onChange={(e) => edit(i, { size: Number(e.target.value) })} /></label>
        <label>Quantidade (máx. {l.kind === 'rune' ? 6 : l.kind === 'lightning' ? 8 : 64})<input type="number" min={1} max={l.kind === 'rune' ? 6 : l.kind === 'lightning' ? 8 : 64} value={Math.min(l.count, l.kind === 'rune' ? 6 : l.kind === 'lightning' ? 8 : 64)} onChange={(e) => edit(i, { count: Math.round(Math.max(1, Math.min(64, Number(e.target.value)))) })} /></label>
        <label>Cor da camada<select value={l.color === 'skill' ? 'skill' : 'fixed'} onChange={(e) => edit(i, { color: e.target.value === 'skill' ? 'skill' : '#a5e9ff' })}><option value="skill">Herdar da habilidade</option><option value="fixed">Personalizada</option></select></label>
        {l.color !== 'skill' && <label>Cor personalizada<input type="color" value={l.color} onChange={(e) => edit(i, { color: e.target.value })} /></label>}
      </div>
    </details>)}
    <div className="vfx-presets"><label>Nova camada<select value={kind} onChange={(e) => setKind(e.target.value as VfxLayerDef['kind'])}>{Object.entries(VFX_LAYER_KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label><button type="button" disabled={layers.length >= 6} onClick={() => update([...layers, newVfxLayer(kind)])}>Adicionar camada ({layers.length}/6)</button></div>
  </fieldset>;
}
