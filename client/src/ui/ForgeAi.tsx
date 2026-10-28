import { useEffect, useRef, useState } from 'react';
import { sanitizeVfxLayers, type VfxLayerDef } from '@rules';
import { supabase } from '../backend/online';

export function ForgeAi({ onApply }: { onApply: (layers: VfxLayerDef[]) => void }) {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VfxLayerDef[] | null>(null);
  const version = useRef(0);
  useEffect(() => () => { version.current++; }, []);
  async function generate() {
    const id = ++version.current; setBusy(true); setError(''); setResult(null);
    try {
      const { data, error } = await supabase().functions.invoke('forge-vfx', { body: { prompt, image: image || undefined } });
      if (error) {
        let message = 'Não foi possível gerar. Verifique a configuração da IA e tente novamente.';
        try { message = (await error.context?.json())?.error ?? message; } catch { /* fallback */ }
        throw new Error(message);
      }
      const layers = sanitizeVfxLayers(data?.layers);
      if (!layers.length) throw new Error('A IA não retornou uma composição válida.');
      if (id === version.current) setResult(layers);
    } catch (e) { if (id === version.current) setError((e as Error).message); }
    finally { if (id === version.current) setBusy(false); }
  }
  return <details className="vfx-layer" open><summary>Criar VFX com IA</summary>
    <p>Descreva o efeito e, se quiser, envie uma referência. A IA combina as camadas disponíveis; não cria modelos 3D nem texturas novas. Texto e imagem serão enviados à NVIDIA ao gerar.</p>
    <label>Descrição<textarea maxLength={2000} value={prompt} disabled={busy} onChange={e => { setPrompt(e.target.value); setResult(null); }} placeholder="Cristais azuis surgem no trajeto, com uma runa e névoa gelada." /></label>
    <label>Imagem de referência (PNG, JPEG ou WebP; até 2 MB)<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0]; setResult(null); setImage(''); setError('');
      const id = ++version.current;
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2000000) { setError('Escolha PNG, JPEG ou WebP de até 2 MB.'); e.target.value = ''; return; }
      const reader = new FileReader(); reader.onload = () => { if (id === version.current) setImage(String(reader.result)); }; reader.onerror = () => setError('Não foi possível ler a imagem.'); reader.readAsDataURL(file);
    }} /></label>
    {image && <><img src={image} alt="Referência do efeito" style={{ maxWidth: '100%', maxHeight: 180 }} /><button type="button" disabled={busy} onClick={() => { version.current++; setImage(''); setResult(null); }}>Remover imagem</button></>}
    <button type="button" disabled={busy || !prompt.trim()} onClick={() => void generate()}>{busy ? 'Criando composição…' : 'Gerar VFX'}</button>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status"><p>Composição pronta: {result.length} camadas. Aplicar substitui as camadas do rascunho; use a prévia e salve quando gostar.</p><button type="button" onClick={() => { onApply(result); setResult(null); }}>Aplicar e visualizar</button><button type="button" onClick={() => setResult(null)}>Descartar</button></div>}
  </details>;
}
