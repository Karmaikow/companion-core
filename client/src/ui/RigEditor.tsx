/**
 * Rig no próprio Administrador: o editor do Mesh2Motion (MIT, hospedado em /rig/) abre o .GLB sem rig, a pessoa encaixa
 * o esqueleto e o arquivo riggado volta direto para cá (postMessage do editor, mesma origem) — sem baixar nem reenviar.
 * Companions: esqueleto humano, sem precisar marcar animações (o pacote padrão vem depois, na aba Animações).
 * Monstros: o esqueleto do bicho e as animações marcadas vão junto no arquivo.
 */
import { useEffect, useRef, useState } from 'react';
import { loadRigPreset, presetQuery, saveRigPreset, type RigPreset } from './rigPreset';

export function RigEditor({ url, name, who, onDone, onClose }: {
  url: string; name: string; who: 'companion' | 'monstro';
  onDone: (file: File) => Promise<void> | void; onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [saving, setSaving] = useState(false);
  // esqueleto salvo (Companions): começa por ele e, se marcado, este encaixe vira o novo ponto de partida
  const [preset, setPreset] = useState<RigPreset | null | undefined>(who === 'companion' ? undefined : null);
  const [usePreset, setUsePreset] = useState(true);
  const [keep, setKeep] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (who !== 'companion') return;
    loadRigPreset().then((p) => { setPreset(p); setKeep(!p); }, () => setPreset(null));
  }, [who]);
  const keepRef = useRef(keep); keepRef.current = keep;
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data as { type?: string; buffer?: ArrayBuffer };
      if (d?.type !== 'm2m-export' || !(d.buffer instanceof ArrayBuffer)) return;
      const slug = name.normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 30) || 'modelo';
      setSaving(true);
      const file = new File([d.buffer], `${slug}-rig.glb`, { type: 'model/gltf-binary' });
      void (async () => {
        if (who === 'companion' && keepRef.current) {
          try { await saveRigPreset(file, name); setNote(`Esqueleto de ${name} guardado: os próximos rigs começam por ele.`); }
          catch (err) { setNote((err as Error).message); }
        }
        await onDone(file);
      })().finally(() => setSaving(false));
    };
    addEventListener('message', on);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose(); };
    addEventListener('keydown', esc);
    return () => { removeEventListener('message', on); removeEventListener('keydown', esc); };
  }, [name, onDone, onClose, saving, who]);

  return (
    <div className="rig-editor" role="dialog" aria-modal="true" aria-label={`Rig de ${name}`}>
      <header>
        <b>Rig de {name}</b>
        <ol>
          {who === 'companion' ? <>
            <li>Gire o modelo para olhar para a linha azul, se precisar, e escolha o esqueleto <b>Human</b>{preset && usePreset ? <> (ele já vem com o encaixe de {preset.from}, esticado para este modelo)</> : null}.</li>
            <li><b>Edit Skeleton</b>: arraste as juntas para dentro do corpo (ombros, cotovelos, punhos, quadril, joelhos, pés). Ative o espelho para fazer os dois lados de uma vez.</li>
            <li><b>Finish</b> e depois <b>Download</b> (não precisa marcar animações): o modelo riggado volta sozinho para cá.</li>
          </> : <>
            <li>Escolha o esqueleto do monstro (quadrúpede, aranha, dragão, pássaro, cobra, tubarão ou kaiju).</li>
            <li><b>Edit Skeleton</b>: encaixe as juntas no corpo e depois <b>Finish</b>.</li>
            <li>Marque as animações (parado, andar, correr, ataque, dano, morte, dormir) e <b>Download</b>: o modelo volta sozinho para cá.</li>
          </>}
        </ol>
        {who === 'companion' && (
          <div className="rig-opts">
            {preset && <label><input type="checkbox" checked={usePreset} onChange={(e) => setUsePreset(e.target.checked)} /> começar pelo esqueleto de {preset.from}</label>}
            <label><input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> guardar este encaixe para os próximos</label>
            {note && <small role="status">{note}</small>}
          </div>
        )}
        <button className="ghost" disabled={saving} onClick={onClose}>{saving ? 'Gravando…' : 'Fechar'}</button>
      </header>
      {preset === undefined ? <p className="hint" style={{ padding: 16 }}>Carregando…</p> : (
        <iframe key={usePreset ? 'p' : 'm'} ref={frame} title="Editor de rig (Mesh2Motion)" src={`/rig/create.html?modelo=${encodeURIComponent(url)}${usePreset ? presetQuery(preset) : ''}`} />
      )}
    </div>
  );
}
