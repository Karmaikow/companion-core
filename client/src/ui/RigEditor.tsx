/**
 * Rig automático no Administrador: o editor do Mesh2Motion (MIT, hospedado em /rig/) abre o .GLB sem rig, escolhe o
 * esqueleto, encaixa as juntas sozinho (humano pelas fatias do corpo; bichos comparando com o modelo do molde), liga a
 * malha aos ossos e devolve o arquivo para cá (postMessage, mesma origem) — sem ninguém clicar.
 * Companions: esqueleto humano, sem animações (o pacote padrão vem depois, na aba Animações).
 * Monstros: o esqueleto do tipo escolhido e todas as animações do molde dele vão juntos no arquivo.
 * A janela mostra o editor trabalhando (só para ver; não dá para mexer).
 */
import { useEffect, useRef, useState } from 'react';

const STAGES: Record<string, string> = { esqueleto: 'Escolhendo o esqueleto…', encaixe: 'Medindo o corpo e encaixando as juntas…', pele: 'Ligando a malha aos ossos…', arquivo: 'Gravando o arquivo…' };

export function AutoRig({ url, name, rig, onDone, onClose }: {
  url: string; name: string; rig: string;
  onDone: (file: File) => Promise<void> | void; onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [stage, setStage] = useState('Abrindo o modelo…');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const doneRef = useRef(onDone); doneRef.current = onDone;
  useEffect(() => {
    // sem resposta em 3 min: algo travou (modelo pesado demais ou quebrado)
    const timer = setTimeout(() => setError((e) => e ?? 'O rig automático demorou demais. Tente de novo ou envie um modelo mais leve.'), 180_000);
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      const d = e.data as { type?: string; stage?: string; message?: string; buffer?: ArrayBuffer };
      if (d?.type === 'm2m-progress' && d.stage) setStage(STAGES[d.stage] ?? d.stage);
      else if (d?.type === 'm2m-error') setError('O rig automático não conseguiu: ' + (d.message ?? 'erro desconhecido'));
      else if (d?.type === 'm2m-export' && d.buffer instanceof ArrayBuffer) {
        clearTimeout(timer);
        const slug = name.normalize('NFD').replace(/[^\w-]+/g, '_').slice(0, 30) || 'modelo';
        setSaving(true); setStage('Salvando o modelo riggado…');
        void Promise.resolve(doneRef.current(new File([d.buffer], `${slug}-rig.glb`, { type: 'model/gltf-binary' }))).finally(() => setSaving(false));
      }
    };
    addEventListener('message', on);
    return () => { clearTimeout(timer); removeEventListener('message', on); };
  }, [name]);

  return (
    <div className="rig-editor auto" role="dialog" aria-modal="true" aria-label={`Rig automático de ${name}`}>
      <header>
        <b>Rig automático · {name}</b>
        <span className={error ? 'msg err' : 'rig-stage'} role="status">{error ?? stage}</span>
        <button className="ghost" disabled={saving} onClick={onClose}>{saving ? 'Gravando…' : error ? 'Fechar' : 'Cancelar'}</button>
      </header>
      <iframe ref={frame} title="Rig automático (Mesh2Motion)" tabIndex={-1} src={`/rig/create.html?modelo=${encodeURIComponent(url)}&auto=1&sozinho=${encodeURIComponent(rig)}`} />
    </div>
  );
}

/** O .GLB já tem esqueleto (pele ligada a ossos)? Lê só o cabeçalho JSON do arquivo. */
export async function glbHasRig(file: Blob): Promise<boolean> {
  try {
    const head = new DataView(await file.slice(0, 20).arrayBuffer());
    if (head.getUint32(0, true) !== 0x46546c67) return false;
    const len = head.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(await file.slice(20, 20 + len).arrayBuffer())) as { skins?: unknown[] };
    return (json.skins?.length ?? 0) > 0;
  } catch { return false; }
}
