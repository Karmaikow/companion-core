/**
 * Gerador de prompt do modelo 3D de um monstro: a imagem de referência + o tipo de esqueleto. A IA geral descreve o
 * bicho pela imagem (ou a pessoa escreve) e o prompt pede a pose que o rig automático encaixa bem. A imagem não é
 * guardada: só vai (reduzida) para a descrição.
 */
import { useState } from 'react';
import { buildCreaturePrompt, CREATURE_RIGS, type CreatureRig } from '@rules';
import { supabase } from '../backend/online';

/** Reduz a imagem (lado maior 768 px, JPEG) para mandar à IA. */
async function shrink(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 768 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

export function RigSelect({ value, onChange, disabled }: { value: CreatureRig; onChange: (r: CreatureRig) => void; disabled?: boolean }) {
  const fams = [...new Set(Object.values(CREATURE_RIGS).map((r) => r.family))];
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as CreatureRig)} aria-label="Esqueleto do monstro">
      {fams.map((f) => (
        <optgroup key={f} label={f}>
          {(Object.keys(CREATURE_RIGS) as CreatureRig[]).filter((k) => CREATURE_RIGS[k].family === f).map((k) => <option key={k} value={k}>{CREATURE_RIGS[k].label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export function CreaturePromptGen({ name, color, element, rig, onRig }: { name: string; color?: string; element?: string; rig: CreatureRig; onRig: (r: CreatureRig) => void }) {
  const [img, setImg] = useState<string | null>(null);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok?: boolean } | null>(null);
  const p = buildCreaturePrompt({ rig, name, description: desc, color, element });

  async function describe() {
    if (!img) return;
    setBusy(true); setNote(null);
    try {
      const { data, error } = await supabase().functions.invoke('refuge', { body: { action: 'admin.ai.describe', image: img, kind: CREATURE_RIGS[rig].label } });
      if (error) throw new Error('Falha ao falar com o servidor.');
      const r = data as { ok: boolean; description?: string; error?: string };
      if (!r.ok || !r.description) throw new Error(r.error ?? 'Sem descrição.');
      setDesc(r.description); setNote({ ok: true, text: 'Descrição pronta (confira e ajuste se quiser).' });
    } catch (e) { setNote({ text: (e as Error).message }); } finally { setBusy(false); }
  }
  const copy = (t: string) => void navigator.clipboard?.writeText(t);

  return (
    <div className="creature-prompt">
      <div className="row">
        <label className="upload">
          <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = '';
            if (f) void shrink(f).then((u) => { setImg(u); setNote(null); }, () => setNote({ text: 'Não consegui abrir a imagem.' }));
          }} />
          {img ? 'Trocar imagem de referência' : 'Imagem de referência'}
        </label>
        {img && <img src={img} alt="Referência" className="ref-thumb" />}
        <label>Tipo<RigSelect value={rig} onChange={onRig} disabled={busy} /></label>
      </div>
      <small className="hint">{CREATURE_RIGS[rig].hint}. A pose do prompt é a que o rig automático encaixa melhor.</small>
      <label>Como o bicho é (em inglês) {img && <button className="link" disabled={busy} onClick={() => void describe()}>{busy ? 'descrevendo…' : 'descrever pela imagem (IA)'}</button>}
        <textarea rows={2} value={desc} maxLength={500} placeholder="a stocky wolf-like beast with mossy green fur, stone horns and glowing amber eyes" onChange={(e) => setDesc(e.target.value)} />
      </label>
      {note && <small className={note.ok ? 'ok' : 'msg err'}>{note.text}</small>}
      <label>1. Referência para o modelo 3D (use junto com a imagem num gerador de imagem) <button className="link" onClick={() => copy(p.modelPrompt)}>copiar</button></label>
      <textarea readOnly rows={6} value={p.modelPrompt} />
      <label>Folha de vistas (frente, esquerda, direita, verso → multivista do Tripo) <button className="link" onClick={() => copy(p.views)}>copiar</button></label>
      <textarea readOnly rows={4} value={p.views} />
      <label>Evitar <button className="link" onClick={() => copy(p.negative)}>copiar</button></label>
      <textarea readOnly rows={2} value={p.negative} />
      <small>{p.tripo}</small>
    </div>
  );
}
