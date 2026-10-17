import type { IncomingMessage, ServerResponse } from 'node:http';
import { FormImageProvider, validateArt } from './form-art.js';
import { assetPrompt, validateBrief, DIRECTION_VERSION } from '../studio/asset-direction.js';

const MAX_BODY = 4_100_000;
type Reference = { name: string; image: string };
export function studioInput(input: unknown) {
  const b = input as { brief?: unknown; references?: unknown; paidConsent?: unknown; requestId?: unknown; sprite?: unknown };
  const brief = validateBrief(b?.brief);
  if (b.paidConsent !== true) throw Error('Confirme o envio das referências e o uso da API paga antes de gerar.');
  if (typeof b.requestId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(b.requestId)) throw Error('Identificador do pedido inválido.');
  if (!Array.isArray(b.references) || b.references.length > 3) throw Error('Use até três referências.');
  const references = b.references.map((r: Reference) => {
    if (!r || typeof r.name !== 'string' || r.name.length > 160 || typeof r.image !== 'string' || r.image.length > 1_300_000) throw Error('Referência inválida ou maior que 950 KB.');
    return { name: r.name, bytes: validateArt(r.image).bytes };
  });
  if (b.sprite !== undefined && typeof b.sprite !== 'boolean') throw Error('Modo de geração inválido.');
  const sprite = b.sprite === true;
  if (sprite && references.length !== 1) throw Error('A geração de sprites exige uma referência de personagem.');
  return { brief, prompt: sprite ? brief.prompt : assetPrompt(brief), references, id: b.requestId, sprite };
}
type Provider = Pick<FormImageProvider, 'status' | 'generate'>;
type Dependencies = { env?: NodeJS.ProcessEnv; request?: typeof fetch; provider?: Provider };
class StudioError extends Error { constructor(public status: number, message: string) { super(message); } }
export function createStudioHandler(deps: Dependencies = {}) {
  const env = deps.env ?? process.env, request = deps.request ?? fetch;
  const provider = deps.provider ?? new FormImageProvider('/tmp/companion-studio', request, env);
  return async (req: IncomingMessage & { body?: unknown }, res: ServerResponse) => {
    const reply = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
    let reserved = false, id = '', metadata: Record<string, unknown> = {};
    let backend: ((path: string, init?: RequestInit) => Promise<Response>) | null = null;
    try {
      if (!['GET', 'POST'].includes(req.method || '')) { res.setHeader('Allow', 'GET, POST'); throw new StudioError(405, 'Método inválido.'); }
      const base = env.SUPABASE_URL?.replace(/\/$/, ''), key = env.SUPABASE_PUBLISHABLE_KEY;
      if (!base || !key) throw new StudioError(503, 'O Studio precisa da configuração Supabase deste deploy.');
      if (!/^https:\/\/[^/]+\.supabase\.co$/.test(base)) throw new StudioError(503, 'Configuração Supabase inválida no servidor.');
      const token = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '')?.[1];
      if (!token || token.length > 8192) throw new StudioError(401, 'Entre na sua conta Companion Core.');
      backend = (path, init = {}) => request(base + path, { ...init, headers: { apikey: key, Authorization: `Bearer ${token}`, ...(init.headers || {}) }, signal: AbortSignal.timeout(15_000) });
      const auth = await backend('/auth/v1/user');
      if (!auth.ok) throw new StudioError(401, 'A sessão expirou. Entre novamente.');
      const user = await auth.json() as { id?: string };
      if (!user.id || !/^[\da-f-]{36}$/i.test(user.id)) throw new StudioError(401, 'Sessão inválida.');
      const admins = await backend('/rest/v1/studio_admins?select=user_id&user_id=eq.' + user.id);
      if (!admins.ok) throw new StudioError(503, 'Não foi possível verificar o acesso ao Studio.');
      if (!(await admins.json() as unknown[]).length) throw new StudioError(403, 'Geração e rascunhos são restritos ao administrador do Studio.');
      if (req.method === 'GET') { reply(200, { ...provider.status(), storage: 'supabase', mode: 'cloud' }); return; }
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new StudioError(415, 'Envie JSON.');
      if (Number(req.headers['content-length']) > MAX_BODY) throw new StudioError(413, 'Pedido maior que 4 MB. Reduza as referências.');
      let input = req.body;
      if (input === undefined) {
        let raw = '';
        for await (const chunk of req) { raw += chunk.toString(); if (Buffer.byteLength(raw) > MAX_BODY) throw new StudioError(413, 'Pedido maior que 4 MB.'); }
        try { input = JSON.parse(raw); } catch { throw new StudioError(400, 'JSON inválido.'); }
      } else {
        if (Buffer.byteLength(JSON.stringify(input)) > MAX_BODY) throw new StudioError(413, 'Pedido maior que 4 MB.');
      }
      let job: ReturnType<typeof studioInput>;
      try { job = studioInput(input); } catch(error) { throw new StudioError(400, error instanceof Error ? error.message : 'Pedido inválido.'); }
      id = job.id;
      if (!provider.status().configured) throw new StudioError(503, 'Geração indisponível: configure COMPANION_IMAGE_API_KEY no servidor. Upload, prompt e biblioteca continuam disponíveis.');
      const objectPath = `${user.id}/assets/${id}.png`;
      const refs = job.references.map((r, i) => ({ name: r.name, object_path: `${user.id}/references/${id}-${i}.png`, purpose: job.sprite ? 'character-reference' : 'style-reference-only' }));
      metadata = { studioVersion: 1, directionVersion: DIRECTION_VERSION, brief: job.brief, source: 'openai', assetType: job.sprite ? 'sprite-strip' : 'image', references: refs, generation: { state: 'generating', requestId: id, model: provider.status().model } };
      const insert = await backend('/rest/v1/studio_assets', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ id, name: job.brief.name, category: 'refuge', prompt: job.prompt, status: 'draft', object_path: objectPath, metadata }) });
      if (insert.status === 409) throw new StudioError(409, 'Este pedido já foi enviado. Atualize a biblioteca antes de tentar outro; não houve nova geração.');
      if (!insert.ok) throw new StudioError(503, 'Não foi possível reservar o rascunho. Nenhuma geração foi iniciada.');
      reserved = true;
      const upload = async (path: string, bytes: Buffer) => {
        const response = await backend!('/storage/v1/object/companion-studio/' + path, { method: 'POST', headers: { 'Content-Type': 'image/png', 'x-upsert': 'false' }, body: new Uint8Array(bytes) });
        if (!response.ok) throw new StudioError(503, 'Não foi possível guardar os arquivos no bucket privado. Confira a biblioteca antes de tentar novamente.');
      };
      for (let i = 0; i < refs.length; i++) await upload(refs[i].object_path, job.references[i].bytes);
      let image: string;
      try { image = await provider.generate(job.prompt, true, job.references.map(r => r.bytes)); }
      catch(error) { throw new StudioError(502, error instanceof Error ? error.message : 'O provedor não concluiu a geração.'); }
      const art = validateArt(image); await upload(objectPath, art.bytes);
      metadata.generation = { state: 'ready', requestId: id, model: provider.status().model };
      const saved = await backend('/rest/v1/studio_assets?id=eq.' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ mime_type: 'image/png', file_bytes: art.bytes.length, metadata }) });
      if (!saved.ok) throw new StudioError(503, 'A imagem foi gerada, mas a confirmação do rascunho falhou. Confira a biblioteca; não repita a cobrança.');
      const rows = await saved.json() as unknown[];
      if (!rows.length) throw new StudioError(503, 'A biblioteca não confirmou o rascunho. Confira o pedido antes de gerar novamente.');
      reply(200, { asset: rows[0] });
    } catch (error) {
      const message = error instanceof StudioError ? error.message : 'O serviço não confirmou o pedido. Confira a biblioteca antes de tentar novamente.';
      if (reserved && backend) {
        metadata.generation = { state: 'failed', requestId: id, message: 'Pedido não confirmado. Confira a biblioteca e o painel do provedor antes de uma nova tentativa.' };
        await backend('/rest/v1/studio_assets?id=eq.' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metadata }) }).catch(() => {});
      }
      reply(error instanceof StudioError ? error.status : 503, { error: message, requestId: id || undefined });
    }
  };
}
