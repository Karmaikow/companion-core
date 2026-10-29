import { useEffect, useRef, useState } from 'react';
import { VFX_LAYER_KINDS, type VfxLayerDef } from '@rules';
import { parseVfxJson, exampleVfxJson, VFX_JSON_LIMIT } from './vfxJson';

export function ForgeVfxImport({ onApply }: { onApply: (layers: VfxLayerDef[]) => void }) {
  const [text, setText] = useState('');
  const [layers, setLayers] = useState<VfxLayerDef[] | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  function edit(value: string) { request.current++; setReading(false); setText(value); setLayers(null); setError(''); setMessage(''); }
  return <details className="vfx-layer vfx-import" open>
    <summary>Importar composição JSON</summary>
    <p>Recebeu uma receita de VFX no chat? Cole abaixo ou abra o arquivo. Não exige chave de API.</p>
    <label>Arquivo JSON (até 64 KB)<input type="file" accept=".json,application/json" onChange={async e => {
      const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
      const id = ++request.current; setLayers(null); setError(''); setMessage(''); setReading(true); setText('');
      try {
        if (file.size > VFX_JSON_LIMIT) throw new Error('O arquivo deve ter até 64 KB.');
        const value = await file.text(); if (id === request.current) setText(value);
      } catch (e) { if (id === request.current) setError((e as Error).message); }
      finally { if (id === request.current) setReading(false); }
    }} /></label>
    <label>Receita JSON<textarea rows={8} maxLength={VFX_JSON_LIMIT} value={text} onChange={e => edit(e.target.value)} placeholder={'{"layers": [...]}'} spellCheck={false} /></label>
    <div className="vfx-presets">
      <button type="button" disabled={reading || !text.trim()} onClick={() => { setError(''); setMessage(''); setLayers(null); try { setLayers(parseVfxJson(text)); } catch(e) { setError((e as Error).message); } }}>Conferir composição</button>
      <button type="button" onClick={() => edit(exampleVfxJson())}>Carregar exemplo</button>
    </div>
    {reading && <p role="status">Lendo arquivo…</p>}
    {error && <p role="alert">{error}</p>}
    {layers && <div>
      <p>Composição válida · {layers.length} camadas</p>
      <ol>{layers.map((l,i) => <li key={i}>{VFX_LAYER_KINDS[l.kind]} · {l.enabled ? 'ativa' : 'desativada'} · {l.phase === 'prepare' ? 'preparação' : 'lançamento'} + {l.delay}s · duração {l.duration}s</li>)}</ol>
      <p>Aplicar substitui as camadas do rascunho. Confira o efeito na prévia e salve a habilidade quando estiver satisfeito.</p>
      <div className="vfx-presets"><button type="button" onClick={() => { onApply(layers); setLayers(null); setMessage('Composição aplicada à prévia. Salve a habilidade para guardar.'); }}>Aplicar à prévia</button><button type="button" onClick={() => setLayers(null)}>Descartar composição</button></div>
    </div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
