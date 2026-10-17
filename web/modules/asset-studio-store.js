import { cloudAuth, studioCloudRequest } from './cloud-vault.js';

const DB = 'companion-asset-studio-v1';
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('assets', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function transaction(mode, work) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('assets', mode), request = work(tx.objectStore('assets'));
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || Error('Não foi possível guardar no navegador.'));
      tx.onabort = () => reject(tx.error || Error('O salvamento foi cancelado.'));
    });
  } finally { db.close(); }
}
export const localLibrary = {
  access: async () => ({ canWrite: true, label: 'Neste navegador · exporte para levar a outro dispositivo' }),
  list: async () => (await transaction('readonly', s => s.getAll())).sort((a,b) => b.created_at.localeCompare(a.created_at)),
  image: async row => row.image || null,
  references: async row => row.references || [],
  save: async draft => {
    const row = { id: crypto.randomUUID(), name: draft.brief.name, category: 'refuge', status: 'draft', prompt: draft.prompt,
      created_at: new Date().toISOString(), image: draft.image || null, references: draft.references,
      metadata: { studioVersion: 1, directionVersion: 1, brief: draft.brief, source: draft.source, alpha: draft.alpha } };
    await transaction('readwrite', s => s.add(row));
    return row;
  }
};

async function checked(response, fallback) {
  if (!response.ok) {
    // Storage/PostgREST internals are not product messages.
    if (response.status === 401) throw Error('Sua sessão expirou. Entre novamente no Core.');
    if (response.status === 403) throw Error('Esta conta não tem permissão de administrador do Studio.');
    throw Error(fallback);
  }
  return response;
}
function objectPath(path) {
  if (typeof path !== 'string' || !path || path.length > 300 || path.split('/').some(p => !p || p === '.' || p === '..')) throw Error('Arquivo do catálogo inválido.');
  return path.split('/').map(encodeURIComponent).join('/');
}
export function createCloudLibrary(request = studioCloudRequest, currentUser = cloudAuth.currentUser) {
  const json = async (path, init) => (await checked(await request('/rest/v1/' + path, init), 'A biblioteca online não respondeu. Confira sua conexão e as permissões do Studio.')).json();
  const download = async path => {
    const res = await request('/storage/v1/object/authenticated/companion-studio/' + objectPath(path));
    if (res.status === 404) return null;
    return (await checked(res, 'Não foi possível baixar o arquivo privado.')).blob();
  };
  return {
    access: async () => {
      const user = await currentUser();
      if (!user) throw Error('Entre na sua conta no Companion Core para abrir o Studio online.');
      const rows = await json('studio_admins?select=user_id&user_id=eq.' + encodeURIComponent(user.id));
      return { canWrite: rows.length > 0, label: rows.length ? 'Conta online · rascunhos privados do Studio' : 'Conta online · catálogo publicado, sem edição' };
    },
    list: () => json('studio_assets?select=*&order=created_at.desc&limit=100'),
    image: async row => row.object_path && (!row.mime_type || row.mime_type.startsWith('image/')) ? download(row.object_path) : null,
    references: async row => Promise.all((Array.isArray(row.metadata?.references) ? row.metadata.references : []).slice(0,3).map(async r => {
      const blob = await download(r.object_path);
      if (!blob) throw Error('Uma referência deste rascunho está indisponível.');
      return { name: r.name || 'Referência', blob };
    })),
    save: async draft => {
      const user = await currentUser();
      if (!user) throw Error('Entre novamente no Core.');
      const id = crypto.randomUUID(), imagePath = draft.image ? `${user.id}/assets/${id}.png` : null;
      const refs = draft.references.map((r,i) => ({ name:r.name, object_path:`${user.id}/references/${id}-${i}.png`, purpose:'style-reference-only' }));
      const metadata = { studioVersion:1, directionVersion:1, brief:draft.brief, source:draft.source, alpha:draft.alpha, references:refs, saveState:'uploading' };
      await json('studio_assets', { method:'POST', headers:{'Content-Type':'application/json',Prefer:'return=representation'}, body:JSON.stringify({id,name:draft.brief.name,category:'refuge',status:'draft',prompt:draft.prompt,object_path:imagePath,metadata}) });
      const upload = async (path, blob) => checked(await request('/storage/v1/object/companion-studio/' + objectPath(path), {method:'POST',headers:{'Content-Type':'image/png','x-upsert':'false'},body:blob}), 'O upload não foi confirmado. O rascunho permanece na biblioteca; confira antes de repetir.');
      for(let i=0;i<refs.length;i++) await upload(refs[i].object_path,draft.references[i].blob);
      if (draft.image) await upload(imagePath,draft.image);
      metadata.saveState='ready';
      const rows = await json('studio_assets?id=eq.' + id, {method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({metadata,mime_type:draft.image?'image/png':null,file_bytes:draft.image?.size||0})});
      if (!rows.length) throw Error('O salvamento não foi confirmado. Atualize a biblioteca.');
      return rows[0];
    }
  };
}
