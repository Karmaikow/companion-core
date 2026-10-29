import { useEffect, useRef, useState } from 'react';
import { uploadWorldAsset } from './catalog';

export function SkillIconUpload({ value, onChange, onBusy }: { value?: string; onChange: (url?: string) => void; onBusy: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // The parent keys this editor by skill and prevents switching during upload.
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Escolha PNG, JPEG ou WebP de até 2 MB.'); return;
    }
    setBusy(true); onBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const valid = bitmap.width <= 2048 && bitmap.height <= 2048 && bitmap.width >= 32 && bitmap.height >= 32;
      bitmap.close();
      if (!valid) throw new Error('O ícone deve ter entre 32 e 2048 pixels de largura e altura.');
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const result = await uploadWorldAsset(`skill-icons/${crypto.randomUUID()}.${extension}`, file);
      if (mounted.current) onChange(result.url);
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'Não foi possível enviar o ícone.'); }
    finally { if (mounted.current) { setBusy(false); onBusy(false); } }
  }
  return <fieldset><legend>Ícone da habilidade</legend>
    {value && <img src={value} alt="Prévia do ícone" width={72} height={72} style={{objectFit:'contain',borderRadius:12}} />}
    <label>Enviar imagem<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e => { void upload(e.target.files?.[0]); e.target.value=''; }} /></label>
    <small>Recomendado: imagem quadrada de 256 × 256 pixels. Salve a habilidade após o envio.</small>
    {value && <button type="button" disabled={busy} onClick={() => onChange(undefined)}>Remover ícone</button>}
    {busy && <p role="status">Enviando ícone…</p>}{error && <p role="alert">{error}</p>}
  </fieldset>;
}
